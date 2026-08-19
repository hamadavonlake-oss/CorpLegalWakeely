import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { UnauthorizedException } from '@nestjs/common';
import { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { ERROR_CODES } from '@glo/shared';
import { makeMockExecutionContext } from '../../../test-helpers';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  // ─── 1. Valid user passes through ───────────────────────────
  it('should return user when authentication succeeds', () => {
    const user = { sub: 'u1', organizationId: 'o1' };
    const ctx = makeMockExecutionContext({ user });

    const result = guard.handleRequest(null, user, undefined, ctx as never);
    expect(result).toBe(user);
  });

  // ─── 2. No user throws UNAUTHORIZED ──────────────────────────
  it('should throw UNAUTHORIZED when no user (false)', () => {
    const ctx = makeMockExecutionContext();

    expect(() => guard.handleRequest(null, false, undefined, ctx as never))
      .toThrow(UnauthorizedException);

    try {
      guard.handleRequest(null, false, undefined, ctx as never);
    } catch (e) {
      const err = e as UnauthorizedException;
      expect(err.getResponse()).toMatchObject({
        error: { code: ERROR_CODES.UNAUTHORIZED },
      });
    }
  });

  // ─── 3. Expired token throws TOKEN_EXPIRED ──────────────────
  it('should throw TOKEN_EXPIRED for expired tokens', () => {
    const ctx = makeMockExecutionContext();
    const info = new TokenExpiredError('jwt expired', new Date());

    try {
      guard.handleRequest(null, false, info, ctx as never);
      fail('Expected UnauthorizedException');
    } catch (e) {
      const err = e as UnauthorizedException;
      expect(err.getResponse()).toMatchObject({
        error: { code: ERROR_CODES.TOKEN_EXPIRED },
      });
    }
  });

  // ─── 4. Invalid token throws INVALID_TOKEN ──────────────────
  it('should throw INVALID_TOKEN for malformed tokens', () => {
    const ctx = makeMockExecutionContext();
    const info = new JsonWebTokenError('invalid token');

    try {
      guard.handleRequest(null, false, info, ctx as never);
      fail('Expected UnauthorizedException');
    } catch (e) {
      const err = e as UnauthorizedException;
      expect(err.getResponse()).toMatchObject({
        error: { code: ERROR_CODES.INVALID_TOKEN },
      });
    }
  });

  // ─── 5. Internal error bubbles up ───────────────────────────
  it('should re-throw non-JWT errors', () => {
    const ctx = makeMockExecutionContext();
    const err = new Error('internal error');

    expect(() => guard.handleRequest(err, false, undefined, ctx as never))
      .toThrow('internal error');
  });
});
