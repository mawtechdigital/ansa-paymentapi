import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Payment } from './entities/payment.entity';
import { User } from './entities/user.entity';
import { PaymentStatus } from './enums/payment-status.enum';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { RevenueMonsterService } from '../revenue-monster/revenue-monster.service';
import {
  RMOnlinePaymentResponse,
  RMCallbackPayload,
  RMCheckoutStatusResponse,
} from '../revenue-monster/interfaces/rm-response.interface';
import { encrypt } from '../common/utils/encryption.util';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly rmService: RevenueMonsterService,
    private readonly configService: ConfigService,
  ) {}

  // ============================================================
  // API 1: INITIATE PAYMENT
  // ============================================================

  async initiatePayment(dto: InitiatePaymentDto) {
    // 1. Find or create user by email
    const user = await this.findOrCreateUser(dto);

    // 2. Generate unique order ID: ANS-YYYYMMDD-XXX
    const orderId = await this.generateOrderId();

    // 3. Build Revenue Monster request body
    const rmBody = {
      order: {
        title: dto.title,
        detail: dto.detail || '',
        additionalData: `plate:${dto.plateNumber}|ins:${dto.insuranceName}`,
        amount: dto.amount,
        currencyType: 'MYR',
        id: orderId,
      },
      customer: {
        userId: user.userId.toString(),
        email: user.email,
      },
      type: 'WEB_PAYMENT',
      storeId: this.rmService.getStoreId(),
      redirectUrl: this.configService.getOrThrow('RM_REDIRECT_URL'),
      notifyUrl: this.configService.getOrThrow('RM_NOTIFY_URL'),
      layoutVersion: this.configService.get('RM_LAYOUT_VERSION', 'v4'),
      method: [],
    };

    // 4. Call Revenue Monster API
    let rmResponse: RMOnlinePaymentResponse;
    try {
      rmResponse = await this.rmService.post<RMOnlinePaymentResponse>(
        '/v3/payment/online',
        rmBody,
      );
    } catch (error) {
      this.logger.error(`RM payment creation failed: ${error.message}`);
      throw new Error('Failed to create payment with payment gateway');
    }

    // 5. Save payment record to DB
    const payment = this.paymentRepo.create({
      orderId,
      title: dto.title,
      detail: dto.detail || null,
      amount: dto.amount,
      plateNumber: dto.plateNumber,
      insuranceName: dto.insuranceName,
      checkoutId: rmResponse.item.checkoutId,
      checkoutUrl: rmResponse.item.url,
      callbackUrl: dto.callbackUrl,
      redirectUrl: this.configService.getOrThrow('RM_REDIRECT_URL'),
      status: PaymentStatus.PENDING,
      userId: user.userId,
    });

    await this.paymentRepo.save(payment);
    this.logger.log(`Payment created: ${orderId} for user ${user.userId}`);

    // 6. Return response
    return {
      userId: user.userId,
      userEmail: user.email,
      orderId,
      data: {
        checkoutId: rmResponse.item.checkoutId,
        url: rmResponse.item.url,
      },
    };
  }

  // ============================================================
  // API 2: REVENUE MONSTER CALLBACK (notifyUrl)
  // ============================================================

  async handleRmCallback(payload: RMCallbackPayload) {
    const orderId = payload?.data?.order?.id;
    const rmStatus = payload?.data?.status;
    const transactionId = payload?.data?.transactionId;
    const amount = payload?.data?.order?.amount;
    const method = payload?.data?.method;

    this.logger.log(
      `RM callback received: orderId=${orderId}, status=${rmStatus}`,
    );

    // 1. Find payment in DB
    const payment = await this.paymentRepo.findOne({
      where: { orderId },
      relations: ['user'],
    });

    if (!payment) {
      this.logger.warn(`Payment not found for orderId: ${orderId}`);
      return { status: 'OK' };
    }

    // 2. Verify amount matches (prevent tampering)
    if (amount !== payment.amount) {
      this.logger.error(
        `Amount mismatch! DB: ${payment.amount}, RM: ${amount}, orderId: ${orderId}`,
      );
      return { status: 'OK' };
    }

    // 3. Update payment record
    payment.transactionId = transactionId;
    payment.rmRawCallback = payload as any;
    payment.status =
      rmStatus === 'SUCCESS' ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;

    if (rmStatus === 'SUCCESS') {
      payment.paidAt = new Date();
    }

    await this.paymentRepo.save(payment);
    this.logger.log(`Payment ${orderId} updated to ${payment.status}`);

    // 4. Forward result to developer's callback URL
    await this.forwardToDeveloper(payment, method);

    return { status: 'OK' };
  }

  // ============================================================
  // API 3: CHECK PAYMENT STATUS
  // ============================================================

  async getPaymentStatus(orderId: string) {
    // 1. Find payment in DB
    const payment = await this.paymentRepo.findOne({
      where: { orderId },
      relations: ['user'],
    });

    if (!payment) {
      throw new NotFoundException(`Payment not found: ${orderId}`);
    }

    // 2. If still PENDING, query RM for latest status
    if (payment.status === PaymentStatus.PENDING && payment.checkoutId) {
      try {
        const rmStatus =
          await this.rmService.get<RMCheckoutStatusResponse>(
            `/v3/payment/online?checkoutId=${payment.checkoutId}`,
          );

        if (rmStatus?.item?.status === 'SUCCESS') {
          payment.status = PaymentStatus.SUCCESS;
          payment.transactionId = rmStatus.item.transactionId;
          payment.paidAt = new Date();
          await this.paymentRepo.save(payment);
        } else if (rmStatus?.item?.status === 'FAILED') {
          payment.status = PaymentStatus.FAILED;
          await this.paymentRepo.save(payment);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to query RM checkout status: ${error.message}`,
        );
      }
    }

    // 3. Return clean response
    return {
      orderId: payment.orderId,
      status: payment.status,
      amount: payment.amount,
      currencyType: payment.currencyType,
      plateNumber: payment.plateNumber,
      insuranceName: payment.insuranceName,
      checkoutUrl: payment.checkoutUrl,
      transactionId: payment.transactionId,
      userId: payment.userId,
      userEmail: payment.user?.email,
      webhookDelivered: payment.webhookDelivered,
      createdAt: payment.createdAt,
      paidAt: payment.paidAt,
    };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Find existing user by email, or create a new one
   */
  private async findOrCreateUser(dto: InitiatePaymentDto): Promise<User> {
    let user = await this.userRepo.findOne({
      where: { email: dto.customerEmail },
    });

    if (user) {
      // Update fields if currently null and new values provided
      let updated = false;

      if (!user.name && dto.customerName) {
        user.name = dto.customerName;
        updated = true;
      }
      if (!user.address && dto.customerAddress) {
        user.address = dto.customerAddress;
        updated = true;
      }
      if (!user.documentNumber && dto.customerIdentityNumber) {
        const secretKey = this.configService.getOrThrow('ENCRYPTION_SECRET_KEY');
        user.documentNumber = encrypt(dto.customerIdentityNumber, secretKey);
        updated = true;
      }

      if (updated) {
        await this.userRepo.save(user);
      }

      return user;
    }

    // Create new user
    const newUser = this.userRepo.create({
      email: dto.customerEmail,
      name: dto.customerName,
      address: dto.customerAddress || null,
      documentNumber: dto.customerIdentityNumber
        ? encrypt(
            dto.customerIdentityNumber,
            this.configService.getOrThrow('ENCRYPTION_SECRET_KEY'),
          )
        : null,
    });

    await this.userRepo.save(newUser);
    this.logger.log(`New user created: ${newUser.userId} (${newUser.email})`);

    return newUser;
  }

  /**
   * Generate order ID format: ANS-YYYYMMDD-XXX
   * XXX resets to 001 each day
   */
  private async generateOrderId(): Promise<string> {
    const now = new Date();
    const dateStr =
      now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0');

    // Count today's payments for the daily counter
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const todayCount = await this.paymentRepo.count({
      where: { createdAt: Between(startOfDay, endOfDay) },
    });

    const counter = (todayCount + 1).toString().padStart(3, '0');

    return `ANS-${dateStr}-${counter}`;
  }

  /**
   * Forward payment result to developer's callback URL
   */
  private async forwardToDeveloper(
    payment: Payment,
    method?: string,
  ): Promise<void> {
    const webhookPayload = {
      orderId: payment.orderId,
      status: payment.status,
      transactionId: payment.transactionId,
      amount: payment.amount,
      currencyType: payment.currencyType,
      method: method || null,
      plateNumber: payment.plateNumber,
      insuranceName: payment.insuranceName,
      userId: payment.userId,
      paidAt: payment.paidAt,
    };

    try {
      const res = await fetch(payment.callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      if (res.ok) {
        payment.webhookDelivered = true;
        await this.paymentRepo.save(payment);
        this.logger.log(
          `Webhook delivered: ${payment.orderId} → ${payment.callbackUrl}`,
        );
      } else {
        this.logger.warn(
          `Webhook failed: ${payment.orderId} → HTTP ${res.status}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Webhook error: ${payment.orderId} → ${error.message}`,
      );
    }
  }
}
