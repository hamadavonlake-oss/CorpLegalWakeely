import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './identity/auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { CountryPacksModule } from './country-packs/country-packs.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    CountryPacksModule,
    HealthModule,
  ],
})
export class AppModule {}
