import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { ERROR_CODES } from '@glo/shared';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Handle JWT-specific errors gracefully.
   * Expired tokens get TOKEN_EXPIRED, other JWT errors get INVALID_TOKEN,
   * and missing tokens get UNAUTHORIZED.
   */
  override handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
    info: Error | undefined,
    _context: ExecutionContext,
  ): TUser {
    if (err) {
      throw err;
    }

    if (info instanceof TokenExpiredError) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: ERROR_CODES.TOKEN_EXPIRED,
          message: 'Token has expired',
        },
      });
    }

    if (info instanceof JsonWebTokenError) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_TOKEN,
          message: 'Invalid token',
        },
      });
    }

    if (!user) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Authentication required',
        },
      });
    }

    return user;
  }
}
