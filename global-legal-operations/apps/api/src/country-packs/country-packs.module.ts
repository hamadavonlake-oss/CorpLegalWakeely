import { Module } from '@nestjs/common';
import { CountryPacksService } from './country-packs.service';
import { CountryPacksController } from './country-packs.controller';
import { TenantTransactionService } from '../database/tenant-transaction.service';

@Module({
  controllers: [CountryPacksController],
  providers: [CountryPacksService, TenantTransactionService],
  exports: [CountryPacksService],
})
export class CountryPacksModule {}
