import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaService } from '../database/prisma.service';
import type { ServiceHealth } from '@glo/shared';

/**
 * Prisma health indicator — runs SELECT 1 against the database.
 */
@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(
    key: string,
  ): Promise<HealthIndicatorResult & { serviceHealth?: ServiceHealth }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      const latencyMs = Date.now() - start;
      return {
        [key]: { status: 'up' },
        serviceHealth: { status: 'up', latencyMs },
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const msg = error instanceof Error ? error.message : 'Unknown error';
      const result: HealthIndicatorResult & { serviceHealth?: ServiceHealth } = {
        [key]: { status: 'down' },
        serviceHealth: { status: 'down', latencyMs, error: msg },
      };
      throw new HealthCheckError('Database health check failed', result);
    }
  }
}
