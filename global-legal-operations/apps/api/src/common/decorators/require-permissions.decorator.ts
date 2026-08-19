import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSIONS_KEY = 'require:permissions';

/**
 * Decorator to specify required permissions for an endpoint.
 *
 * @example
 * ```
 * @RequirePermissions('organization.read', 'organization.update')
 * @Get(':id')
 * async getOrg() { ... }
 * ```
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
