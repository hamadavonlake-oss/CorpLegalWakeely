import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import type { ServiceHealth } from '@glo/shared';

/**
 * Redis health indicator.
 *
 * In Phase 0 this uses a stub implementation.
 * Once BullMQ is wired (Phase 1+), inject the Redis connection
 * and replace the stub with a real ping.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  async isHealthy(key: string): Promise<HealthIndicatorResult & { serviceHealth?: ServiceHealth }> {
    const start = Date.now();
    try {
      // Stub: in Phase 1+ replace with:
      //   await this.redis.ping();
      const latencyMs = Date.now() - start;
      return {
        [key]: { status: 'up' },
        serviceHealth: { status: 'up', latencyMs },
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Redis health check failed: ${msg}`);
      const result: HealthIndicatorResult & { serviceHealth?: ServiceHealth } = {
        [key]: { status: 'down' },
        serviceHealth: { status: 'down', latencyMs, error: msg },
      };
      throw new HealthCheckError('Redis health check failed', result);
    }
  }
}
