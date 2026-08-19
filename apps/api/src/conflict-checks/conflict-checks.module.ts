import { Module } from '@nestjs/common';
import { ConflictChecksController } from './conflict-checks.controller';
import { ConflictChecksService } from './conflict-checks.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ConflictChecksController],
  providers: [ConflictChecksService],
  exports: [ConflictChecksService],
})
export class ConflictChecksModule {}
