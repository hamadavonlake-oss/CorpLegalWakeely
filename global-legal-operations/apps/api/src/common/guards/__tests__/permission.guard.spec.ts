import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { PermissionGuard } from '../permission.guard';
import { ERROR_CODES } from '@glo/shared';
import { makeMockExecutionContext, makeMockJwtPayload } from '../../../test-helpers';
import { RoleCode } from '@glo/shared';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;
  let mockPrisma: Record<string, unknown>;

  beforeEach(() => {
    reflector = new Reflector();
    mockPrisma = {
      role: {
        findMany: jest.fn(),
      },
      rolePermission: {
        count: jest.fn(),
      },
    };
    guard = new PermissionGuard(reflector, mockPrisma as never);
  });

  // ─── 1. No required permissions → allow ──────────────────
  it('should allow through when no permissions required', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = makeMockExecutionContext();

    const result = await guard.canActivate(ctx as never);
    expect(result).toBe(true);
  });

  // ─── 2. User has all required permissions ────────────────
  it('should allow when user roles have all required permissions', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['org.read']);
    const payload = makeMockJwtPayload({
      roles: [RoleCode.enterprise_owner],
    });
    const ctx = makeMockExecutionContext({ user: payload });

    (mockPrisma.role as { findMany: jest.Mock }).findMany.mockResolvedValue([
      { id: 'role-1' },
    ]);
    (mockPrisma.rolePermission as { count: jest.Mock }).count.mockResolvedValue(1);

    const result = await guard.canActivate(ctx as never);
    expect(result).toBe(true);
  });

  // ─── 3. User missing permissions → FORBIDDEN ─────────────
  it('should throw FORBIDDEN when user lacks required permissions', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['org.read', 'org.write']);
    const payload = makeMockJwtPayload({
      roles: [RoleCode.business_requester],
    });
    const ctx = makeMockExecutionContext({ user: payload });

    (mockPrisma.role as { findMany: jest.Mock }).findMany.mockResolvedValue([
      { id: 'role-1' },
    ]);
    // Only 1 of 2 permissions found
    (mockPrisma.rolePermission as { count: jest.Mock }).count.mockResolvedValue(1);

    await expect(guard.canActivate(ctx as never)).rejects.toThrow(ForbiddenException);
  });

  // ─── 4. No user context → FORBIDDEN ───────────────────────
  it('should throw FORBIDDEN when no user context', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['org.read']);
    const ctx = makeMockExecutionContext(); // no user

    await expect(guard.canActivate(ctx as never)).rejects.toThrow(ForbiddenException);
  });
});
