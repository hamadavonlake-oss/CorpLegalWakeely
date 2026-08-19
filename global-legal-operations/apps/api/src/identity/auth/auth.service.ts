import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { authenticator } from 'otplib';
import {
  RoleCode,
  JWT_ACCESS_TTL,
  JWT_REFRESH_TTL,
  MFA_ISSUER,
  ERROR_CODES,
} from '@glo/shared';
import type {
  AuthProvider,
  AuthIdentity,
  TokenPair,
  MfaEnrollment,
} from './auth-provider.interface';
import { RegisterDto } from './dto/register.dto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface JwtPayload {
  sub: string;
  org: string;
  email: string;
  roles: RoleCode[];
  mfa: boolean;
  kid: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService implements AuthProvider {
  private readonly logger = new Logger(AuthService.name);
  private privateKey: string;
  private publicKey: string;
  private kid: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    const { privateKey, publicKey, kid } = this.loadOrGenerateKeys();
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.kid = kid;
  }

  // ─── Key Management ─────────────────────────────────────────

  private loadOrGenerateKeys(): {
    privateKey: string;
    publicKey: string;
    kid: string;
  } {
    const keyPath =
      this.config.get<string>('JWT_PRIVATE_KEY_PATH') ??
      path.join(process.cwd(), 'config', 'jwt');
    const privFile = path.join(keyPath, 'private.pem');
    const pubFile = path.join(keyPath, 'public.pem');

    if (fs.existsSync(privFile) && fs.existsSync(pubFile)) {
      this.logger.warn('Loading RSA key pair from disk');
      const kid = crypto
        .createHash('sha256')
        .update(fs.readFileSync(pubFile, 'utf-8'))
        .digest('hex')
        .substring(0, 16);
      return {
        privateKey: fs.readFileSync(privFile, 'utf-8'),
        publicKey: fs.readFileSync(pubFile, 'utf-8'),
        kid,
      };
    }

    // Dev-only: generate RSA key pair
    this.logger.warn(
      'No RSA key pair found — generating a new one (dev only). '
      + 'In production, provide JWT_PRIVATE_KEY_PATH.',
    );

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Ensure directory exists
    fs.mkdirSync(keyPath, { recursive: true });
    fs.writeFileSync(privFile, privateKey, { mode: 0o600 });
    fs.writeFileSync(pubFile, publicKey, { mode: 0o644 });

    const kid = crypto
      .createHash('sha256')
      .update(publicKey)
      .digest('hex')
      .substring(0, 16);

    return { privateKey, publicKey, kid };
  }

  // ─── Registration (bonus — not part of AuthProvider interface) ─

  async register(dto: RegisterDto): Promise<AuthIdentity> {
    // Create organization
    const organization = await this.prisma.organization.create({
      data: {
        name: dto.organizationName,
        slug: dto.slug,
      },
    });

    // Create default role for the org owner
    const role = await this.prisma.role.create({
      data: {
        organizationId: organization.id,
        code: RoleCode.enterprise_owner,
        name: 'Enterprise Owner',
        isSystem: true,
      },
    });

    // Hash password with Argon2id
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const displayName = `${dto.firstName} ${dto.lastName}`;

    // Create user
    const user = await this.prisma.user.create({
      data: {
        organizationId: organization.id,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName,
        roles: {
          create: {
            roleId: role.id,
          },
        },
      },
      include: { roles: { include: { role: true } } },
    });

    this.logger.log(`User registered: userId=${user.id}`);

    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles.map((ur) => ur.role.code as RoleCode),
      mfaEnabled: user.mfaEnabled,
      status: user.status as AuthIdentity['status'],
    };
  }

  // ─── AuthProvider Implementation ──────────────────────────────

  async validateCredentials(
    email: string,
    password: string,
  ): Promise<AuthIdentity | null> {
    // Generic error — never reveal if the email exists
    const genericError = new UnauthorizedException({
      success: false,
      error: {
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Invalid credentials',
      },
    });

    // Find user by email (hardcoded org for Phase 1, tenant context in Phase 2)
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      include: { roles: { include: { role: true } } },
    });

    if (!user) {
      this.logger.log(`Login failed: no user found for provided email`);
      throw genericError;
    }

    // Check lockout
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      this.logger.log(`Login failed: account locked for userId=${user.id}`);
      throw new ForbiddenException({
        success: false,
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: 'Account temporarily locked due to too many failed attempts. Try again later.',
        },
      });
    }

    // Verify password with Argon2id
    const valid = await argon2.verify(user.passwordHash, password, {
      type: argon2.argon2id,
    });

    if (!valid) {
      await this.handleFailedLogin(user.id, user.failedLoginCount);
      this.logger.log(`Login failed: invalid password for userId=${user.id}`);
      throw genericError;
    }

    // Check user status
    if (user.status === 'disabled') {
      this.logger.log(`Login failed: disabled user userId=${user.id}`);
      throw genericError;
    }

    if (user.status === 'locked') {
      this.logger.log(`Login failed: locked user userId=${user.id}`);
      throw genericError;
    }

    // Successful login — reset failed count, update lastLoginAt
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    this.logger.log(`Login successful: userId=${user.id}`);

    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles.map((ur) => ur.role.code as RoleCode),
      mfaEnabled: user.mfaEnabled,
      status: user.status as AuthIdentity['status'],
    };
  }

  async issueAccessToken(identity: AuthIdentity): Promise<TokenPair> {
    const accessTtl = JWT_ACCESS_TTL; // '15m'
    const refreshTtl = JWT_REFRESH_TTL; // '30d'

    // Parse TTL strings to seconds
    const accessExpiresInSec = this.parseTtlToSeconds(accessTtl);
    const refreshExpiresInSec = this.parseTtlToSeconds(refreshTtl);

    const payload: JwtPayload = {
      sub: identity.id,
      org: identity.organizationId,
      email: identity.email,
      roles: identity.roles,
      mfa: identity.mfaEnabled,
      kid: this.kid,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      privateKey: this.privateKey,
      algorithm: 'RS256',
      expiresIn: accessTtl,
      keyid: this.kid,
    });

    // Generate a cryptographically random refresh token
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');

    // Hash refresh token with Argon2id before storing (never store raw)
    const refreshTokenHash = await argon2.hash(rawRefreshToken, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    // Store session
    const expiresAt = new Date(Date.now() + refreshExpiresInSec * 1000);
    await this.prisma.authSession.create({
      data: {
        userId: identity.id,
        refreshTokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: accessExpiresInSec,
      tokenType: 'Bearer',
    };
  }

  async rotateRefreshToken(refreshToken: string): Promise<TokenPair> {
    const hash = await argon2.hash(refreshToken, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const session = await this.prisma.authSession.findFirst({
      where: { refreshTokenHash: hash, revokedAt: null },
    });

    if (!session) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_TOKEN,
          message: 'Invalid or revoked refresh token',
        },
      });
    }

    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        success: false,
        error: {
          code: ERROR_CODES.TOKEN_EXPIRED,
          message: 'Refresh token expired',
        },
      });
    }

    // Revoke old session
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    // Load user identity
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      include: { roles: { include: { role: true } } },
    });

    if (!user) {
      throw new InternalServerErrorException({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'User not found for session',
        },
      });
    }

    const identity: AuthIdentity = {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles.map((ur) => ur.role.code as RoleCode),
      mfaEnabled: user.mfaEnabled,
      status: user.status as AuthIdentity['status'],
    };

    return this.issueAccessToken(identity);
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    this.logger.log(`Session revoked: sessionId=${sessionId}`);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.log(`All sessions revoked for userId=${userId}`);
  }

  async enrollMfa(userId: string): Promise<MfaEnrollment> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found',
        },
      });
    }

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, MFA_ISSUER, secret);

    // Store secret temporarily (will be activated on verify)
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    this.logger.log(`MFA enrollment initiated: userId=${userId}`);

    return { secret, otpauthUrl };
  }

  async verifyMfa(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaSecret) {
      return false;
    }

    const isValid = authenticator.verify({
      token: code,
      secret: user.mfaSecret,
    });

    if (isValid) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true },
      });
      this.logger.log(`MFA verified and enabled: userId=${userId}`);
    } else {
      this.logger.log(`MFA verification failed: userId=${userId}`);
    }

    return isValid;
  }

  async disableMfa(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });
    this.logger.log(`MFA disabled: userId=${userId}`);
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private async handleFailedLogin(
    userId: string,
    currentFailedCount: number,
  ): Promise<void> {
    const newCount = currentFailedCount + 1;
    const updateData: Record<string, unknown> = {
      failedLoginCount: newCount,
    };

    if (newCount >= MAX_FAILED_ATTEMPTS) {
      updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      this.logger.warn(
        `Account locked: userId=${userId} after ${newCount} failed attempts`,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  }

  private parseTtlToSeconds(ttl: string): number {
    const match = ttl.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // default 15m
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900;
    }
  }

  /** Verify an RS256 JWT and return its payload. */
  async verifyToken(token: string): Promise<JwtPayload> {
    return this.jwt.verifyAsync<JwtPayload>(token, {
      publicKey: this.publicKey,
      algorithms: ['RS256'],
    });
  }

  /** Get the public key (used by JwtStrategy). */
  getPublicKey(): string {
    return this.publicKey;
  }

  /** Get the key ID. */
  getKid(): string {
    return this.kid;
  }
}