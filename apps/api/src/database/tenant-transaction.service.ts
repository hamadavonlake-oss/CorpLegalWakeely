import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from './prisma.service';

/**
 * TenantTransactionService wraps every tenant-scoped operation in a Prisma
 * transaction that first calls `set_config('app.current_organization_id', ?, true)`
 * so that PostgreSQL Row-Level Security policies (see migration
 * `20260820000000_phase2_conflict_checks_rls`) enforce tenant isolation
 * at the database layer — fail-closed defence in depth.
 *
 * The `true` (is_local) argument to set_config scopes the variable to the
 * current transaction only, so two concurrent requests in different tenants
 * cannot leak.
 *
 * Phase 2 (current): full RLS activation. Every CUD on a tenant-scoped table
 * MUST go through `runInTenantContext`. Read paths that bypass this wrapper
 * will see zero rows (because no `app.current_organization_id` is set,
 * `current_setting(..., true)` returns NULL, and the equality check fails).
 *
 * For non-tenant-scoped queries (reference data, system roles), the caller
 * may use `prisma` directly — but must NEVER query a tenant-scoped table
 * without going through this wrapper.
 */
@Injectable()
export class TenantTransactionService {
  private readonly logger = new Logger(TenantTransactionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run a function in a tenant-scoped context.
   *
   * Sets the PostgreSQL session variable `app.current_organization_id`
   * within a Prisma transaction, then invokes the callback with the
   * transaction client. RLS policies on all tenant-scoped tables will
   * restrict both reads and writes to the given organization.
   *
   * @param organizationId The tenant organization ID
   * @param fn Callback receiving the transaction Prisma client
   */
  async runInTenantContext<T>(
    organizationId: string,
    fn: (
      prisma: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    ) => Promise<T>,
  ): Promise<T> {
    this.logger.debug(
      `Running in tenant context: organizationId=${organizationId}`,
    );

    return this.prisma.$transaction(async (tx) => {
      // Set the tenant context variable for this transaction only.
      // The `true` (is_local) flag scopes it to the current transaction,
      // so concurrent requests in different tenants cannot leak.
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_organization_id',
          ${organizationId}::text,
          true
        )
      `;

      return fn(tx);
    });
  }

  /**
   * Verify that RLS is enforcing isolation for the given organization.
   *
   * Used by tenant-isolation tests to assert that a request with tenant
   * context set to organization A cannot read rows belonging to
   * organization B.
   *
   * @returns the raw count of visible rows in `organizations` after
   *          setting the tenant context — should be exactly 1 (the
   *          caller's own org) under normal operation.
   */
  async debugVisibleOrganizationCount(
    organizationId: string,
  ): Promise<number> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_organization_id',
          ${organizationId}::text,
          true
        )
      `;
      const rows = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM "organizations"
      `;
      return Number(rows[0]?.count ?? 0);
    });
    return result;
  }
}
