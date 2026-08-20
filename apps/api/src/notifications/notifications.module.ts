import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsEventBus } from './notifications-event-bus';
import { EmailService } from './email.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsEventBus, EmailService],
  exports: [NotificationsService, NotificationsEventBus, EmailService],
})
export class NotificationsModule {}
