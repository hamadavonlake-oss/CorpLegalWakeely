import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import type { Request } from 'express';
import type { TenantContext, RoleCode } from '@glo/shared';

/** JWT payload shape returned by JwtStrategy and attached by Passport */
interface JwtUserPayload {
  sub: string;
  organizationId: string;
  email: string;
  roles: RoleCode[];
  mfaEnabled: boolean;
}

/**
 * TenantGuard extracts organizationId / userId / roles from the JWT payload
 * (attached by JwtAuthGuard) and sets `request.tenantContext`.
 *
 * /health endpoint is always allowed through without tenant context.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const { path } = request;

    // Always allow health endpoint
    if (path.includes('/health')) {
      return true;
    }

    const user = request.user as JwtUserPayload | undefined;

    // If tenantContext already set (e.g., by middleware), don't overwrite
    const reqAny = request as unknown as Record<string, unknown>;
    if (reqAny.tenantContext) {
      return true;
    }

    if (!user) {
      this.logger.warn(
        `No user context on ${request.method} ${path} – auth not yet implemented, allowing through`,
      );
      return true;
    }

    const { sub: userId, organizationId, roles } = user;
    (request as Request & { tenantContext?: TenantContext }).tenantContext = {
      organizationId,
      userId,
      roles,
    };

    return true;
  }
}
