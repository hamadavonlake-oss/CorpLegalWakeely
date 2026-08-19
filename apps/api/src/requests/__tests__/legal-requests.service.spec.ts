import { Test, TestingModule } from '@nestjs/testing';
import { LegalRequestsService } from '../legal-requests.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { AuditService } from '../../audit/audit.service';
import { LegalRequestStatus } from '@glo/shared';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type { TenantContext } from '@glo/shared';

/**
 * In-memory mock that simulates the tenant transaction + Prisma client
 * for LegalRequestsService. The mock enforces:
 *   - `runInTenantContext` provides a tx client with the same shape
 *   - `legalRequest.findFirst` only returns rows matching organizationId
 *     (simulating RLS tenant isolation at the app layer)
 *   - `legalRequest.count` is used for request number generation
 */
function makeMockInfra() {
  const requestsStore: Array<Record<string, unknown>> = [];
  const entitiesStore: Array<Record<string, unknown>> = [];
  const usersStore: Array<Record<string, unknown>> = [];
  const auditStore: Array<Record<string, unknown>> = [];

  const txClient = {
    legalRequest: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `req-${requestsStore.length + 1}`,
          ...data,
          rowVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        requestsStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        // Simulate RLS: only return rows matching organizationId
        return (
          requestsStore.find(
            (r) =>
              r.id === where.id &&
              r.organizationId === where.organizationId &&
              (where.deletedAt === null ? r.deletedAt === null : true),
          ) ?? null
        );
      }),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const prefix = (where.requestNumber as { startsWith?: string } | undefined)?.startsWith;
        return requestsStore.filter(
          (r) =>
            r.organizationId === where.organizationId &&
            (prefix ? String(r.requestNumber).startsWith(prefix) : true),
        ).length;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return requestsStore.filter(
          (r) =>
            r.organizationId === where.organizationId &&
            (where.deletedAt === null ? r.deletedAt === null : true),
        );
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = requestsStore.find((r) => r.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { rowVersion: (row.rowVersion as number) + 1 });
        return row;
      }),
    },
    entity: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          entitiesStore.find(
            (e) =>
              e.id === where.id &&
              e.organizationId === where.organizationId,
          ) ?? null
        );
      }),
    },
    user: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          usersStore.find(
            (u) =>
              u.id === where.id &&
              u.organizationId === where.organizationId,
          ) ?? null
        );
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => {
      return fn(txClient);
    }),
    legalRequest: txClient.legalRequest,
    entity: txClient.entity,
    user: txClient.user,
  };

  const tenantTx = {
    runInTenantContext: jest.fn(
      async <T>(orgId: string, fn: (tx: typeof txClient) => Promise<T>) => {
        return fn(txClient);
      },
    ),
  };

  const audit = {
    append: jest.fn(async (input: Record<string, unknown>) => {
      const entry = { id: `audit-${auditStore.length + 1}`, ...input };
      auditStore.push(entry);
      return entry;
    }),
  };

  // Helpers for test setup
  const seedEntity = (id: string, orgId: string) => {
    entitiesStore.push({ id, organizationId: orgId, deletedAt: null });
  };
  const seedUser = (id: string, orgId: string) => {
    usersStore.push({ id, organizationId: orgId, deletedAt: null });
  };
  const seedRequest = (id: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id,
      organizationId: orgId,
      entityId: null,
      requestNumber: `REQ-2026-${String(requestsStore.length + 1).padStart(4, '0')}`,
      title: 'Test Request',
      titleEn: null,
      description: null,
      type: null,
      priority: 'medium',
      status: LegalRequestStatus.draft,
      requestedBy: 'user-1',
      assignedTo: null,
      classification: 'internal',
      deletedAt: null,
      deletedBy: null,
      rowVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    requestsStore.push(row);
    return row;
  };

  return {
    prisma,
    tenantTx,
    audit,
    txClient,
    stores: { requestsStore, entitiesStore, usersStore, auditStore },
    seedEntity,
    seedUser,
    seedRequest,
  };
}

const makeCtx = (overrides: Partial<TenantContext> = {}): TenantContext => ({
  organizationId: 'org-1',
  userId: 'user-1',
  roles: [],
  ...overrides,
});

describe('LegalRequestsService', () => {
  let service: LegalRequestsService;
  let mock: ReturnType<typeof makeMockInfra>;

  beforeEach(async () => {
    mock = makeMockInfra();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegalRequestsService,
        { provide: PrismaService, useValue: mock.prisma },
        { provide: TenantTransactionService, useValue: mock.tenantTx },
        { provide: AuditService, useValue: mock.audit },
      ],
    }).compile();
    service = module.get(LegalRequestsService);
  });

  describe('create', () => {
    it('creates a draft request with a generated request number', async () => {
      const req = await service.create(makeCtx(), { title: 'Test' });
      expect(req.status).toBe(LegalRequestStatus.draft);
      expect(req.requestNumber).toMatch(/^REQ-\d{4}-\d{4}$/);
      expect(mock.audit.append).toHaveBeenCalledTimes(1);
      expect(mock.audit.append.mock.calls[0]![0]).toMatchObject({
        action: 'create',
        objectType: 'legal_request',
      });
    });

    it('throws NotFound when entityId does not belong to the org', async () => {
      await expect(
        service.create(makeCtx(), { title: 'Test', entityId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when assignedTo user does not belong to the org', async () => {
      await expect(
        service.create(makeCtx(), { title: 'Test', assignedTo: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('accepts a valid entityId', async () => {
      mock.seedEntity('ent-1', 'org-1');
      const req = await service.create(
        makeCtx(),
        { title: 'Test', entityId: 'ent-1' },
      );
      expect(req.entityId).toBe('ent-1');
    });
  });

  describe('transition', () => {
    it('transitions draft → submitted', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.draft });
      const updated = await service.transition(
        makeCtx(),
        'req-1',
        LegalRequestStatus.submitted,
      );
      expect(updated.status).toBe(LegalRequestStatus.submitted);
    });

    it('transitions submitted → triaged', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.submitted });
      const updated = await service.transition(
        makeCtx(),
        'req-1',
        LegalRequestStatus.triaged,
      );
      expect(updated.status).toBe(LegalRequestStatus.triaged);
    });

    it('throws BadRequest for invalid transition (draft → in_progress)', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.draft });
      await expect(
        service.transition(makeCtx(), 'req-1', LegalRequestStatus.in_progress),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest for terminal → any (closed → in_progress)', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.closed });
      await expect(
        service.transition(makeCtx(), 'req-1', LegalRequestStatus.in_progress),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound for request from a different org (RLS)', async () => {
      mock.seedRequest('req-1', 'org-OTHER', { status: LegalRequestStatus.draft });
      await expect(
        service.transition(makeCtx(), 'req-1', LegalRequestStatus.submitted),
      ).rejects.toThrow(NotFoundException);
    });

    it('is idempotent when transitioning to the same status', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.draft });
      const result = await service.transition(
        makeCtx(),
        'req-1',
        LegalRequestStatus.draft,
      );
      expect(result.status).toBe(LegalRequestStatus.draft);
      // Audit should NOT be called for idempotent transitions
      expect(mock.audit.append).not.toHaveBeenCalled();
    });

    it('logs an audit entry with before/after state on transition', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.draft });
      await service.transition(makeCtx(), 'req-1', LegalRequestStatus.submitted, 'user requested');
      expect(mock.audit.append).toHaveBeenCalledTimes(1);
      const auditCall = mock.audit.append.mock.calls[0]![0];
      expect(auditCall).toMatchObject({
        action: 'update',
        objectType: 'legal_request',
        beforeState: { status: 'draft' },
        afterState: { status: 'submitted', reason: 'user requested' },
      });
    });
  });

  describe('update', () => {
    it('updates a draft request', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.draft });
      const updated = await service.update(makeCtx(), 'req-1', {
        title: 'Updated Title',
      });
      expect(updated.title).toBe('Updated Title');
    });

    it('throws Conflict when rowVersion mismatch (optimistic locking)', async () => {
      mock.seedRequest('req-1', 'org-1', {
        status: LegalRequestStatus.draft,
        rowVersion: 5,
      });
      await expect(
        service.update(makeCtx(), 'req-1', {
          title: 'X',
          rowVersion: 3,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequest when updating a non-editable request (submitted)', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.submitted });
      await expect(
        service.update(makeCtx(), 'req-1', { title: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows updating a waiting_for_information request', async () => {
      mock.seedRequest('req-1', 'org-1', {
        status: LegalRequestStatus.waiting_for_information,
      });
      const updated = await service.update(makeCtx(), 'req-1', {
        description: 'Updated',
      });
      expect(updated.description).toBe('Updated');
    });
  });

  describe('softDelete', () => {
    it('deletes a draft request', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.draft });
      const result = await service.softDelete(makeCtx(), 'req-1');
      expect(result.success).toBe(true);
    });

    it('throws BadRequest when deleting an in_progress request', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.in_progress });
      await expect(
        service.softDelete(makeCtx(), 'req-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('returns the request with includes', async () => {
      mock.seedRequest('req-1', 'org-1');
      const req = await service.findOne(makeCtx(), 'req-1');
      expect(req.id).toBe('req-1');
    });

    it('throws NotFound for non-existent request', async () => {
      await expect(
        service.findOne(makeCtx(), 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound for request from a different org (RLS)', async () => {
      mock.seedRequest('req-1', 'org-OTHER');
      await expect(
        service.findOne(makeCtx(), 'req-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns paginated requests for the current tenant', async () => {
      mock.seedRequest('req-1', 'org-1');
      mock.seedRequest('req-2', 'org-1');
      mock.seedRequest('req-3', 'org-OTHER'); // should not appear
      const result = await service.list(makeCtx(), { page: 1, limit: 10 });
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });
  });
});
