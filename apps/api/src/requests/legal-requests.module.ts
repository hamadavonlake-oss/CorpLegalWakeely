import { Module } from '@nestjs/common';
import { LegalRequestsController } from './legal-requests.controller';
import { LegalRequestsService } from './legal-requests.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [LegalRequestsController],
  providers: [LegalRequestsService],
  exports: [LegalRequestsService],
})
export class LegalRequestsModule {}
