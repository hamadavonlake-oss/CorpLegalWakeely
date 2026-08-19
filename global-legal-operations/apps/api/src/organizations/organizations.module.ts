import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { TenantTransactionService } from '../database/tenant-transaction.service';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, TenantTransactionService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
