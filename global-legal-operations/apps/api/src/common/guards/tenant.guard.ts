import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import type { Request } from 'express';
import type { TenantContext, RoleCode } from '@glo/shared';

/** Augment Express Request with tenant context */
declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        organizationId: string;
        roles: RoleCode[];
        sessionId?: string;
      };
      tenantContext?: TenantContext;
    }
  }
}

/**
 * TenantGuard extracts organizationId / userId / roles from the JWT payload
 * (attached by an auth guard in future phases) and sets `request.tenantContext`.
 *
 * Phase 0 behaviour:
 * - /health endpoint is always allowed through without tenant context.
 * - For all other routes, a warning is logged if no user is present,
 *   but the request is still allowed (auth not yet implemented).
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

    if (!request.user) {
      this.logger.warn(
        `No user context on ${request.method} ${path} – auth not yet implemented, allowing through`,
      );
      return true;
    }

    const { sub: userId, organizationId, roles, sessionId } = request.user;
    request.tenantContext = {
      organizationId,
      userId,
      roles,
      sessionId,
    };

    return true;
  }
}
