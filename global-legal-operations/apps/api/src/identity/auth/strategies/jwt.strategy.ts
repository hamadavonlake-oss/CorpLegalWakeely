import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { RoleCode } from '@glo/shared';
import { ERROR_CODES } from '@glo/shared';
import { AuthService } from '../auth.service';

export interface JwtStrategyPayload {
  sub: string;
  org: string;
  email: string;
  roles: RoleCode[];
  mfa: boolean;
  kid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKey: authService.getPublicKey(),
    });
  }

  async validate(payload: JwtStrategyPayload): Promise<{
    sub: string;
    organizationId: string;
    email: string;
    roles: RoleCode[];
    mfaEnabled: boolean;
  }> {
    if (!payload.sub || !payload.org) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_TOKEN,
          message: 'Invalid token payload',
        },
      });
    }

    return {
      sub: payload.sub,
      organizationId: payload.org,
      email: payload.email,
      roles: payload.roles,
      mfaEnabled: payload.mfa,
    };
  }
}
