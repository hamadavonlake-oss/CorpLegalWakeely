import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import type { ServiceHealth } from '@glo/shared';

/**
 * Prisma health indicator.
 *
 * In Phase 0 this uses a stub implementation.
 * Once the PrismaModule is wired (Phase 1+), inject PrismaService
 * and replace the stub with a real SELECT 1 query.
 */
@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult & { serviceHealth?: ServiceHealth }> {
    const start = Date.now();
    try {
      // Stub: in Phase 1+ replace with:
      //   await this.prisma.$queryRaw`SELECT 1`;
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
      throw new HealthCheckError('Prisma health check failed', result);
    }
  }
}
