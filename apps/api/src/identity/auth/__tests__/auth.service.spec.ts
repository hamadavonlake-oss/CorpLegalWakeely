import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../database/prisma.service';
import { RoleCode, ERROR_CODES } from '@glo/shared';
import * as argon2 from 'argon2';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 'argon2id',
}));

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue(''),
}));

// Generate real RSA keys — crypto mock returns actual keys
jest.mock('node:crypto', () => {
  const actual = jest.requireActual('node:crypto');
  const keys = actual.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    ...actual,
    generateKeyPairSync: jest.fn().mockReturnValue(keys),
    createHash: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('a1b2c3d4e5f6a7b8'),
    }),
    randomBytes: jest.fn().mockReturnValue(Buffer.from('a'.repeat(64))),
  };
});

const mockPrisma = {
  user: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  authSession: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  role: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  organization: {
    create: jest.fn(),
  },
};

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        JwtService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_PRIVATE_KEY_PATH') return undefined;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  // ─── 1. Registration ──────────────────────────────────────────
  it('should register a new user with organization', async () => {
    mockPrisma.organization.create.mockResolvedValue({
      id: 'org-1', name: 'Test Org', slug: 'test-org',
    });
    mockPrisma.role.create.mockResolvedValue({
      id: 'role-1', code: RoleCode.enterprise_owner,
    });
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-1', organizationId: 'org-1', email: 'test@example.com',
      passwordHash: 'hashed', firstName: 'Test', lastName: 'User',
      displayName: 'Test User', mfaEnabled: false, status: 'active',
      roles: [{ role: { code: RoleCode.enterprise_owner } }],
    });

    const result = await service.register({
      email: 'test@example.com', password: 'SecureP@ssw0rd!',
      firstName: 'Test', lastName: 'User',
      organizationName: 'Test Org', slug: 'test-org',
    });

    expect(result.email).toBe('test@example.com');
    expect(result.organizationId).toBe('org-1');
    expect(result.roles).toContain(RoleCode.enterprise_owner);
    expect(argon2.hash).toHaveBeenCalledWith(
      'SecureP@ssw0rd!',
      expect.objectContaining({ type: 'argon2id' }),
    );
  });

  // ─── 2. Validate Credentials - Success ────────────────────────
  it('should validate credentials and return identity on success', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-1', organizationId: 'org-1', email: 'test@example.com',
      passwordHash: 'hashed', status: 'active', failedLoginCount: 0,
      lockedUntil: null, displayName: 'Test User', mfaEnabled: false,
      roles: [{ role: { code: RoleCode.enterprise_owner } }],
    });

    const identity = await service.validateCredentials('test@example.com', 'password');

    expect(identity).not.toBeNull();
    expect(identity!.email).toBe('test@example.com');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failedLoginCount: 0 }) }),
    );
  });

  // ─── 3. Validate Credentials - User Not Found ─────────────────
  it('should throw UnauthorizedException when user not found', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.validateCredentials('missing@example.com', 'password'),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ─── 4. Validate Credentials - Wrong Password ─────────────────
  it('should throw UnauthorizedException on wrong password and increment failed count', async () => {
    (argon2.verify as jest.Mock).mockResolvedValueOnce(false);
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-1', organizationId: 'org-1', email: 'test@example.com',
      passwordHash: 'hashed', status: 'active', failedLoginCount: 2,
      lockedUntil: null, displayName: 'Test User', mfaEnabled: false, roles: [],
    });

    await expect(
      service.validateCredentials('test@example.com', 'wrong'),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failedLoginCount: 3 }) }),
    );
  });

  // ─── 5. Validate Credentials - Account Locked ─────────────────
  it('should throw ForbiddenException when account is locked', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-1', organizationId: 'org-1', email: 'test@example.com',
      passwordHash: 'hashed', status: 'active', failedLoginCount: 5,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      displayName: 'Test User', mfaEnabled: false, roles: [],
    });

    await expect(
      service.validateCredentials('test@example.com', 'password'),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── 6. Validate Credentials - Disabled User ──────────────────
  it('should throw UnauthorizedException for disabled user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-1', organizationId: 'org-1', email: 'test@example.com',
      passwordHash: 'hashed', status: 'disabled', failedLoginCount: 0,
      lockedUntil: null, displayName: 'Test User', mfaEnabled: false, roles: [],
    });

    await expect(
      service.validateCredentials('test@example.com', 'password'),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ─── 7. Lockout After 5 Failed Attempts ───────────────────────
  it('should lock account after 5 failed attempts', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-1', organizationId: 'org-1', email: 'test@example.com',
      passwordHash: 'hashed', status: 'active', failedLoginCount: 4,
      lockedUntil: null, displayName: 'Test User', mfaEnabled: false, roles: [],
    });

    await expect(
      service.validateCredentials('test@example.com', 'wrong'),
    ).rejects.toThrow(UnauthorizedException);

    const updateCall = mockPrisma.user.update.mock.calls[0]?.[0];
    expect(updateCall?.data.lockedUntil).toBeDefined();
    expect(updateCall?.data.failedLoginCount).toBe(5);
  });

  // ─── 8. Issue Access Token ────────────────────────────────────
  it('should issue access token and store hashed refresh token', async () => {
    const identity = {
      id: 'user-1', organizationId: 'org-1', email: 'test@example.com',
      displayName: 'Test User', roles: [RoleCode.enterprise_owner] as RoleCode[],
      mfaEnabled: false, status: 'active' as const,
    };

    mockPrisma.authSession.create.mockResolvedValue({ id: 'session-1' });

    const tokens = await service.issueAccessToken(identity);

    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.expiresIn).toBe(900); // 15m

    expect(mockPrisma.authSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          refreshTokenHash: expect.any(String),
        }),
      }),
    );
  });

  // ─── 9. Rotate Refresh Token ──────────────────────────────────
  it('should rotate refresh token and revoke old session', async () => {
    mockPrisma.authSession.findFirst.mockResolvedValue({
      id: 'session-1', userId: 'user-1', refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    mockPrisma.authSession.update.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1', organizationId: 'org-1', email: 'test@example.com',
      displayName: 'Test User', mfaEnabled: false, status: 'active',
      roles: [{ role: { code: RoleCode.enterprise_owner } }],
    });
    mockPrisma.authSession.create.mockResolvedValue({ id: 'session-2' });

    const tokens = await service.rotateRefreshToken('refresh-token');

    expect(tokens.accessToken).toBeDefined();
    expect(mockPrisma.authSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  // ─── 10. Revoke All Sessions ──────────────────────────────────
  it('should revoke all active sessions for a user', async () => {
    mockPrisma.authSession.updateMany.mockResolvedValue({ count: 3 });

    await service.revokeAllUserSessions('user-1');

    expect(mockPrisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  // ─── 11. MFA Enrollment ───────────────────────────────────────
  it('should enroll MFA and return otpauth URL', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1', email: 'test@example.com',
    });
    mockPrisma.user.update.mockResolvedValue({});

    const result = await service.enrollMfa('user-1');

    expect(result.secret).toBeDefined();
    expect(result.otpauthUrl).toContain('otpauth://totp');
    expect(result.otpauthUrl).toContain('test%40example.com');
  });
});
