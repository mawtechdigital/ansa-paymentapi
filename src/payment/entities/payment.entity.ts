import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PaymentStatus } from '../enums/payment-status.enum';
import { User } from './user.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  orderId: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  detail: string;

  @Column()
  amount: number;

  @Column({ default: 'MYR' })
  currencyType: string;

  @Column()
  plateNumber: string;

  @Column()
  insuranceName: string;

  @Column({ nullable: true })
  checkoutId: string;

  @Column({ nullable: true })
  checkoutUrl: string;

  @Column({ nullable: true })
  transactionId: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({nullable: true})
  callbackUrl: string;

  @Column({ nullable: true })
  redirectUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  rmRawCallback: Record<string, any>;

  @Column({ default: false })
  webhookDelivered: boolean;

  @Column({ nullable: true })
  paidAt: Date;

  // ----- Relations -----

  @Column()
  userId: number;

  @ManyToOne(() => User, (user) => user.payments)
  @JoinColumn({ name: 'userId' })
  user: User;

  // ----- Timestamps -----

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
