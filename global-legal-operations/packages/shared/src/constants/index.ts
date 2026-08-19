export const APP_NAME = 'Global Legal Operations Platform';

export const APP_VERSION = '0.1.0';

export const API_PREFIX = 'api/v1';

export const DEFAULT_LOCALE = 'ar';

export const DEFAULT_TIMEZONE = 'Asia/Amman';

export const DEFAULT_CURRENCY = 'JOD';

export const DEFAULT_PAGE_SIZE = 20;

export const MAX_PAGE_SIZE = 100;

export const MAX_UPLOAD_BYTES = 104_857_600;

export const JWT_ACCESS_TTL = '15m';

export const JWT_REFRESH_TTL = '30d';

export const MFA_ISSUER = 'GlobalLegalOperations';

export const S3_DEFAULT_REGION = 'us-east-1';

export const S3_DEFAULT_BUCKET = 'legalops';

export const SUPPORTED_LOCALES = ['ar', 'en'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const RTL_LOCALES = ['ar'] as const;

export const MFA_MANDATORY_ROLES = ['enterprise_owner', 'legal_admin', 'general_counsel', 'platform_admin'] as const;

export const ERROR_CODES = {
  UNAUTHORIZED: 'AUTH.UNAUTHORIZED',
  FORBIDDEN: 'AUTH.FORBIDDEN',
  INVALID_TOKEN: 'AUTH.INVALID_TOKEN',
  TOKEN_EXPIRED: 'AUTH.TOKEN_EXPIRED',
  MFA_REQUIRED: 'AUTH.MFA_REQUIRED',
  INVALID_MFA_CODE: 'AUTH.INVALID_MFA_CODE',
  USER_NOT_FOUND: 'USER.NOT_FOUND',
  USER_ALREADY_EXISTS: 'USER.ALREADY_EXISTS',
  ORGANIZATION_NOT_FOUND: 'ORG.NOT_FOUND',
  TENANT_MISMATCH: 'TENANT.MISMATCH',
  INVALID_STATE_TRANSITION: 'STATE.INVALID_TRANSITION',
  LEGAL_HOLD_ACTIVE: 'LEGAL_HOLD.ACTIVE',
  DOCUMENT_IMMUTABLE: 'DOC.IMMUTABLE',
  FILE_TOO_LARGE: 'FILE.TOO_LARGE',
  FILE_INFECTED: 'FILE.INFECTED',
  NOT_FOUND: 'COMMON.NOT_FOUND',
  VALIDATION_ERROR: 'COMMON.VALIDATION',
  RATE_LIMITED: 'COMMON.RATE_LIMITED',
  INTERNAL_ERROR: 'COMMON.INTERNAL',
} as const;

export const WEBHOOK_EVENT_TYPES = {
  CONTRACT_CREATED: 'contract.created',
  CONTRACT_UPDATED: 'contract.updated',
  CONTRACT_APPROVED: 'contract.approved',
  CONTRACT_REJECTED: 'contract.rejected',
  CONTRACT_SIGNED: 'contract.signed',
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_APPROVED: 'document.approved',
  REQUEST_CREATED: 'request.created',
  REQUEST_STATUS_CHANGED: 'request.status_changed',
  MATTER_CREATED: 'matter.created',
  MATTER_STATUS_CHANGED: 'matter.status_changed',
  APPROVAL_COMPLETED: 'approval.completed',
  APPROVAL_REJECTED: 'approval.rejected',
} as const;

export const WEBHOOK_HEADERS = {
  ID: 'X-Webhook-Id',
  TIMESTAMP: 'X-Webhook-Timestamp',
  SIGNATURE: 'X-Webhook-Signature',
} as const;

export const WEBHOOK_SIGNATURE_ALGORITHM = 'sha256';

export const WEBHOOK_MAX_RETRIES = 5;

export const WEBHOOK_RETRY_BACKOFF_BASE = 5000; // 5 seconds
