import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { RMCallbackPayload } from '../revenue-monster/interfaces/rm-response.interface';

@Controller('api/payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  /**
   * API 1: Initiate a new payment
   * POST /api/payment/initiate
   */
  @Post('initiate')
  async initiatePayment(@Body() dto: InitiatePaymentDto) {
    this.logger.log(
      `Initiating payment: ${dto.title} | ${dto.amount} cents | ${dto.customerEmail}`,
    );
    return this.paymentService.initiatePayment(dto);
  }

  /**
   * API 2: Revenue Monster callback (notifyUrl)
   * POST /api/payment/rm-callback
   * Always returns 200 to RM
   */
  @Post('rm-callback')
  @HttpCode(HttpStatus.OK)
  async handleRmCallback(@Body() payload: RMCallbackPayload) {
    this.logger.log(
      `RM callback: ${payload?.data?.order?.id} | ${payload?.data?.status}`,
    );
    return this.paymentService.handleRmCallback(payload);
  }

  /**
   * API 3: Check payment status
   * GET /api/payment/status/:orderId
   */
  @Get('status/:orderId')
  async getPaymentStatus(@Param('orderId') orderId: string) {
    this.logger.log(`Status check: ${orderId}`);
    return this.paymentService.getPaymentStatus(orderId);
  }
}
