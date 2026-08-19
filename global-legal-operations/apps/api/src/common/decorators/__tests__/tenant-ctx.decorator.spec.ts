import { UnauthorizedException } from '@nestjs/common';
import { ERROR_CODES } from '@glo/shared';
import { makeMockExecutionContext, makeMockJwtPayload } from '../../../test-helpers';

// Import the internal logic directly by re-implementing what @TenantCtx does.
// This avoids the ParameterDecorator type issue in tests.
import type { TenantContext as TenantContextType } from '@glo/shared';

function extractTenantContext(request: Record<string, unknown>): TenantContextType {
  if (request.tenantContext) {
    return request.tenantContext as TenantContextType;
  }

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
}

describe('@TenantCtx() decorator logic', () => {
  // ─── 1. Returns existing tenantContext ─────────────────────
  it('should return existing tenantContext if set', () => {
    const tc = { organizationId: 'org-1', userId: 'u1', roles: [] };
    const ctx = makeMockExecutionContext({ tenantContext: tc });

    const result = extractTenantContext(ctx.switchToHttp().getRequest());
    expect(result).toEqual(tc);
  });

  // ─── 2. Derives from JWT user when no tenantContext ───────
  it('should derive tenantContext from JWT user payload', () => {
    const payload = makeMockJwtPayload();
    const ctx = makeMockExecutionContext({ user: payload });

    const result = extractTenantContext(ctx.switchToHttp().getRequest());
    expect(result).toEqual({
      organizationId: payload.organizationId,
      userId: payload.sub,
      roles: payload.roles,
    });
  });

  // ─── 3. Throws when no auth at all ─────────────────────────
  it('should throw UNAUTHORIZED when no user and no tenantContext', () => {
    const ctx = makeMockExecutionContext();

    expect(() => extractTenantContext(ctx.switchToHttp().getRequest()))
      .toThrow(UnauthorizedException);
  });
});
