import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './identity/auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { CountryPacksModule } from './country-packs/country-packs.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { LegalRequestsModule } from './requests/legal-requests.module';
import { MattersModule } from './matters/matters.module';
import { ConflictChecksModule } from './conflict-checks/conflict-checks.module';
import { ContractsModule } from './contracts/contracts.module';
import { StorageModule } from './storage/storage.module';
import { DocumentsModule } from './documents/documents.module';
import { TemplatesModule } from './templates/templates.module';
import { ClausesModule } from './clauses/clauses.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    CountryPacksModule,
    HealthModule,
    // Phase 2 — Legal Operations
    AuditModule,
    LegalRequestsModule,
    MattersModule,
    ConflictChecksModule,
    // Phase 3 — Contracts
    ContractsModule,
    // Phase 4 — Documents & Templates
    StorageModule,
    DocumentsModule,
    TemplatesModule,
    ClausesModule,
    // Phase 5 — Approvals
    ApprovalsModule,
    // Phase 6 — Notifications
    NotificationsModule,
  ],
})
export class AppModule {}
