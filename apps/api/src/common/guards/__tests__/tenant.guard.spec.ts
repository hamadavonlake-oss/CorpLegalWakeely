import { TenantGuard } from '../tenant.guard';
import { makeMockExecutionContext, makeMockJwtPayload } from '../../../test-helpers';

describe('TenantGuard', () => {
  let guard: TenantGuard;

  beforeEach(() => {
    guard = new TenantGuard();
  });

  // ─── 1. Health endpoint always passes ──────────────────────
  it('should allow /health without user context', () => {
    const ctx = makeMockExecutionContext({ path: '/api/v1/health' });
    expect(guard.canActivate(ctx as never)).toBe(true);
  });

  // ─── 2. No user context passes (Phase 1 behavior) ─────────
  it('should allow through when no user context (pre-auth)', () => {
    const ctx = makeMockExecutionContext({ path: '/api/v1/organizations/me' });
    expect(guard.canActivate(ctx as never)).toBe(true);
  });

  // ─── 3. Sets tenantContext from JWT user ───────────────────
  it('should set tenantContext from JWT user payload', () => {
    const payload = makeMockJwtPayload();
    const mockReq = { user: payload, path: '/api/v1/test', method: 'GET', headers: {} };
    const ctx = makeMockExecutionContext(mockReq as never);

    expect(guard.canActivate(ctx as never)).toBe(true);
    const req = ctx.switchToHttp().getRequest();
    expect(req.tenantContext).toEqual({
      organizationId: payload.organizationId,
      userId: payload.sub,
      roles: payload.roles,
    });
  });

  // ─── 4. Preserves existing tenantContext ───────────────────
  it('should not overwrite existing tenantContext', () => {
    const existing = { organizationId: 'existing-org', userId: 'u1', roles: [] };
    const mockReq = {
      user: makeMockJwtPayload(),
      tenantContext: existing,
      path: '/api/v1/test',
      method: 'GET',
      headers: {},
    };
    const ctx = makeMockExecutionContext(mockReq as never);

    guard.canActivate(ctx as never);
    const req = ctx.switchToHttp().getRequest();
    expect(req.tenantContext).toBe(existing);
  });
});
