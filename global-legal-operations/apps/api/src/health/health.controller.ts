import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { HealthCheckResponse, ServiceHealth } from '@glo/shared';
import { APP_VERSION } from '@glo/shared';
import { PrismaHealthIndicator } from './prisma-health.indicator';
import { RedisHealthIndicator } from './redis-health.indicator';

/**
 * Measure latency for an async health check and return a ServiceHealth object.
 */
async function measureHealth(
  label: string,
  fn: () => Promise<void>,
): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await fn();
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'down', latencyMs: Date.now() - start, error: msg };
  }
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Check health of all platform services' })
  async health(): Promise<HealthCheckResponse> {
    // --- Database ---
    const database = await measureHealth('database', async () => {
      await this.prismaIndicator.isHealthy('prisma');
    });

    // --- Redis ---
    const redis = await measureHealth('redis', async () => {
      await this.redisIndicator.isHealthy('redis');
    });

    // --- Storage (MinIO) ---
    const storage = await measureHealth('storage', async () => {
      // Stub: in Phase 1+ replace with:
      //   await this.minioClient.listBuckets();
      this.logger.debug('Storage health check skipped (stub)');
    });

    // --- Gotenberg ---
    const gotenbergUrl = this.config.get<string>('GOTENBERG_URL', 'http://localhost:3000');
    const gotenberg = await measureHealth('gotenberg', async () => {
      try {
        const res = await fetch(`${gotenbergUrl}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        throw new Error('Gotenberg unreachable');
      }
    });

    // --- Aggregate status ---
    const allServices = { database, redis, storage, gotenberg };
    const downCount = Object.values(allServices).filter(
      (s) => s.status === 'down',
    ).length;

    let status: HealthCheckResponse['status'];
    if (downCount === 0) {
      status = 'ok';
    } else if (database.status === 'down') {
      status = 'down';
    } else {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: APP_VERSION,
      services: allServices,
    };
  }
}
