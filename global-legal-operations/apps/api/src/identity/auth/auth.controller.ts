import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import type { ApiResponse } from '@glo/shared';
import { ERROR_CODES } from '@glo/shared';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new organization and user' })
  async register(
    @Body() dto: RegisterDto,
  ): Promise<ApiResponse<{ userId: string; organizationId: string }>> {
    const identity = await this.authService.register(dto);
    return {
      success: true,
      data: {
        userId: identity.id,
        organizationId: identity.organizationId,
      },
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  async login(
    @Body() dto: LoginDto,
  ): Promise<ApiResponse> {
    const identity = await this.authService.validateCredentials(
      dto.email,
      dto.password,
    );

    if (!identity) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Invalid credentials',
        },
      };
    }

    if (identity.mfaEnabled) {
      return {
        success: true,
        data: {
          mfaRequired: true,
          userId: identity.id,
        },
      };
    }

    const tokens = await this.authService.issueAccessToken(identity);
    return {
      success: true,
      data: tokens,
    };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token' })
  async refresh(
    @Body() dto: RefreshDto,
  ): Promise<ApiResponse> {
    const tokens = await this.authService.rotateRefreshToken(dto.refreshToken);
    return {
      success: true,
      data: tokens,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke current session' })
  async logout(@Req() req: Request): Promise<ApiResponse> {
    const user = req.user as { sub: string; sessionId?: string };
    // Revoke all sessions for the user (simpler for Phase 1)
    await this.authService.revokeAllUserSessions(user.sub);
    return {
      success: true,
      data: null,
    };
  }

  @Post('mfa/enroll')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start MFA enrollment' })
  async enrollMfa(
    @Req() req: Request,
  ): Promise<ApiResponse> {
    const user = req.user as { sub: string };
    const enrollment = await this.authService.enrollMfa(user.sub);
    return {
      success: true,
      data: {
        secret: enrollment.secret,
        otpauthUrl: enrollment.otpauthUrl,
      },
    };
  }

  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify TOTP code and enable MFA' })
  async verifyMfa(
    @Req() req: Request,
    @Body() dto: MfaVerifyDto,
  ): Promise<ApiResponse> {
    const user = req.user as { sub: string };
    const valid = await this.authService.verifyMfa(user.sub, dto.code);

    if (!valid) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.INVALID_MFA_CODE,
          message: 'Invalid MFA code',
        },
      };
    }

    return {
      success: true,
      data: { mfaEnabled: true },
    };
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable MFA for the current user' })
  async disableMfa(@Req() req: Request): Promise<ApiResponse> {
    const user = req.user as { sub: string };
    await this.authService.disableMfa(user.sub);
    return {
      success: true,
      data: { mfaEnabled: false },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async me(@Req() req: Request): Promise<ApiResponse> {
    const payload = req.user as {
      sub: string;
      org: string;
      email: string;
      roles: string[];
      mfa: boolean;
    };
    return {
      success: true,
      data: {
        id: payload.sub,
        organizationId: payload.org,
        email: payload.email,
        roles: payload.roles,
        mfaEnabled: payload.mfa,
      },
    };
  }
}
