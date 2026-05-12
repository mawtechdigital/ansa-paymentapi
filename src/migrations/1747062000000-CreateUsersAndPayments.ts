import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAndPayments1747062000000
  implements MigrationInterface
{
  name = 'CreateUsersAndPayments1747062000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "payment_status_enum" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED')
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "userId" SERIAL PRIMARY KEY,
        "name" VARCHAR NULL,
        "email" VARCHAR NOT NULL UNIQUE,
        "address" VARCHAR NULL,
        "documentNumber" VARCHAR NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" SERIAL PRIMARY KEY,
        "orderId" VARCHAR NOT NULL UNIQUE,
        "title" VARCHAR NOT NULL,
        "detail" VARCHAR NULL,
        "amount" INTEGER NOT NULL,
        "currencyType" VARCHAR NOT NULL DEFAULT 'MYR',
        "plateNumber" VARCHAR NOT NULL,
        "insuranceName" VARCHAR NOT NULL,
        "checkoutId" VARCHAR NULL,
        "checkoutUrl" VARCHAR NULL,
        "transactionId" VARCHAR NULL,
        "status" "payment_status_enum" NOT NULL DEFAULT 'PENDING',
        "callbackUrl" VARCHAR NOT NULL,
        "redirectUrl" VARCHAR NULL,
        "rmRawCallback" JSONB NULL,
        "webhookDelivered" BOOLEAN NOT NULL DEFAULT false,
        "paidAt" TIMESTAMP NULL,
        "userId" INTEGER NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_payments_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_payments_status" ON "payments" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_createdAt" ON "payments" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_userId" ON "payments" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "payment_status_enum"`);
  }
}
