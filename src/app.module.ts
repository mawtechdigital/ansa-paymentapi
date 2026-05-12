import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RevenueMonsterModule } from './revenue-monster/revenue-monster.module';
import { PaymentModule } from './payment/payment.module';

@Module({
  imports: [
    // Load environment variables based on NODE_ENV
    // npm run start:sandbox → loads .env.sandbox
    // npm run start         → loads .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production' ? '.env' : '.env.sandbox',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.getOrThrow<number>('DB_PORT'),
        username: config.getOrThrow('DB_USERNAME'),
        password: config.getOrThrow('DB_PASSWORD'),
        database: config.getOrThrow('DB_DATABASE'),
        autoLoadEntities: true,
        synchronize: false, // use migrations instead
      }),
    }),

    // Modules
    RevenueMonsterModule,
    PaymentModule,
  ],
})
export class AppModule {}
