import type { LegalRequestStatus, MatterStatus, ContractStatus, DocumentStatus, ApprovalDecision, ConflictCheckStatus, SignatureStatus, ClassificationLevel, RoleCode } from '../enums';

export type UUID = string;

export interface PaginationDto {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

export interface TenantContext {
  organizationId: string;
  entityId?: string;
  userId: string;
  roles: RoleCode[];
  sessionId?: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    storage: ServiceHealth;
    gotenberg: ServiceHealth;
  };
}

export interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  error?: string;
}

export interface WebhookPayload {
  id: string;
  type: string;
  version: string;
  organization_id: string;
  occurred_at: string;
  data: Record<string, unknown>;
  delivery_attempt: number;
}

export interface AuditLogEntry {
  id: UUID;
  organizationId: UUID;
  actorId: UUID;
  actorEmail?: string;
  action: string;
  objectType: string;
  objectId: UUID;
  ipAddress?: string;
  userAgent?: string;
  correlationId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: Date;
}
