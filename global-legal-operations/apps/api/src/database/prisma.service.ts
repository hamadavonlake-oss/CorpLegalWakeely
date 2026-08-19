import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });

    // Startup warning — never log credentials or secrets
    this.logger.warn(
      'PrismaService initializing — never log credentials or secrets',
    );
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connected successfully');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database disconnected gracefully');
  }

  /**
   * Simple health check: runs SELECT 1 and returns latency.
   */
  async healthCheck(): Promise<{ up: boolean; latencyMs: number }> {
    const start = performance.now();
    await this.$queryRaw`SELECT 1`;
    const latencyMs = Math.round(performance.now() - start);
    return { up: true, latencyMs };
  }

  /**
   * Execute operations inside a tenant-scoped transaction.
   * Sets the RLS context parameter (for future Row-Level Security).
   *
   * @param organizationId The tenant organization ID
   * @param fn A callback receiving the interactive Prisma transaction client
   */
  async executeInTenantTransaction<T>(
    organizationId: string,
    fn: (
      prisma: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    ) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.current_organization_id', ${organizationId}::text, true)
      `;
      return fn(tx);
    });
  }
}
