import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from './prisma.service';

/**
 * TenantTransactionService provides a convenience wrapper for running
 * operations within a tenant-scoped database context.
 *
 * Phase 1: Simply executes the provided function against the PrismaService.
 * Phase 2: Will add RLS SET LOCAL via executeInTenantTransaction.
 */
@Injectable()
export class TenantTransactionService {
  private readonly logger = new Logger(TenantTransactionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
 * Run a function in a tenant-scoped context.
 *
 * @param organizationId The tenant organization ID
 * @param fn Callback receiving the Prisma client (or transaction client in Phase 2)
 */
  async runInTenantContext<T>(
    organizationId: string,
    fn: (prisma: PrismaClient) => Promise<T>,
  ): Promise<T> {
    this.logger.debug(`Running in tenant context: organizationId=${organizationId}`);

    // Phase 1: Direct execution. Phase 2 will use executeInTenantTransaction.
    return fn(this.prisma);
  }
}
