import { Module, Global } from '@nestjs/common';
import { RevenueMonsterService } from './revenue-monster.service';

@Global()
@Module({
  providers: [RevenueMonsterService],
  exports: [RevenueMonsterService],
})
export class RevenueMonsterModule {}
