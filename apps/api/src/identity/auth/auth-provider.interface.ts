import type { UUID, RoleCode } from '@glo/shared';

export interface AuthIdentity {
  id: UUID;
  organizationId: UUID;
  email: string;
  displayName: string;
  roles: RoleCode[];
  mfaEnabled: boolean;
  status: 'active' | 'locked' | 'disabled';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface MfaEnrollment {
  secret: string;
  otpauthUrl: string;
}

export interface AuthProvider {
  validateCredentials(email: string, password: string): Promise<AuthIdentity | null>;
  issueAccessToken(identity: AuthIdentity): Promise<TokenPair>;
  rotateRefreshToken(refreshToken: string): Promise<TokenPair>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;
  enrollMfa(userId: string): Promise<MfaEnrollment>;
  verifyMfa(userId: string, code: string): Promise<boolean>;
}
