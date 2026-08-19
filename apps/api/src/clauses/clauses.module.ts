import { Module } from '@nestjs/common';
import { ClausesController } from './clauses.controller';
import { ClausesService } from './clauses.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ClausesController],
  providers: [ClausesService],
  exports: [ClausesService],
})
export class ClausesModule {}
