import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  const port = process.env.PORT || 3000;
  const env = process.env.NODE_ENV || 'sandbox';

  await app.listen(port);
  logger.log(`Server running on http://localhost:${port}`);
  logger.log(`Environment: ${env}`);
  logger.log(`Revenue Monster: ${env === 'production' ? 'PRODUCTION' : 'SANDBOX'}`,);
}

bootstrap();
