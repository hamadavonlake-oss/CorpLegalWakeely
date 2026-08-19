import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import type { RoleCode, UUID } from '@glo/shared';

interface RlsContext {
  organizationId: UUID;
  userId: UUID;
  roles: RoleCode[];
}

/**
 * RlsContextService stores the current tenant context in an AsyncLocalStorage.
 * This is the foundation for RLS context propagation across async boundaries.
 *
 * Usage:
 *   rlsContext.run(orgId, userId, roles, async () => {
 *     // Inside this callback, getOrganizationId/getUserId/getRoles
 *     // will return the values stored above.
 *   });
 */
@Injectable()
export class RlsContextService {
  private readonly storage = new AsyncLocalStorage<RlsContext>();

  /**
   * Run a function within a specific RLS context.
   */
  run<T>(
    organizationId: UUID,
    userId: UUID,
    roles: RoleCode[],
    fn: () => Promise<T>,
  ): Promise<T> {
    const context: RlsContext = { organizationId, userId, roles };
    return new Promise<T>((resolve, reject) => {
      this.storage.run(context, () => {
        fn().then(resolve, reject);
      });
    });
  }

  /**
   * Get the current organization ID from the RLS context.
   * Returns null if no context is set.
   */
  getOrganizationId(): UUID | null {
    const store = this.storage.getStore();
    return store?.organizationId ?? null;
  }

  /**
   * Get the current user ID from the RLS context.
   * Returns null if no context is set.
   */
  getUserId(): UUID | null {
    const store = this.storage.getStore();
    return store?.userId ?? null;
  }

  /**
   * Get the current user roles from the RLS context.
   * Returns an empty array if no context is set.
   */
  getRoles(): RoleCode[] {
    const store = this.storage.getStore();
    return store?.roles ?? [];
  }
}
