import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { TenantContext as TenantContextType } from '@glo/shared';
import { ERROR_CODES } from '@glo/shared';

/**
 * Parameter decorator that extracts tenant context from the request.
 *
 * Resolution order:
 * 1. `request.tenantContext` (set by TenantGuard)
 * 2. `request.user` (set by JwtAuthGuard via PassportStrategy)
 *
 * This ensures @TenantCtx() works whether or not TenantGuard is stacked.
 */
export const TenantCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContextType => {
    const request = ctx.switchToHttp().getRequest();

    // 1. Explicit tenant context set by TenantGuard
    if (request.tenantContext) {
      return request.tenantContext as TenantContextType;
    }

    // 2. Derive from JWT payload (set by JwtAuthGuard + JwtStrategy)
    if (request.user) {
      const user = request.user as {
        sub: string;
        organizationId: string;
        roles: string[];
      };

      if (!user.organizationId) {
        throw new UnauthorizedException({
          success: false,
          error: {
            code: ERROR_CODES.TENANT_MISMATCH,
            message: 'No organization context in token',
          },
        });
      }

      return {
        organizationId: user.organizationId,
        userId: user.sub,
        roles: user.roles,
      } as TenantContextType;
    }

    throw new UnauthorizedException({
      success: false,
      error: {
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authentication required',
      },
    });
  },
);
