import { Test, TestingModule } from '@nestjs/testing';
import { MattersService } from '../matters.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { AuditService } from '../../audit/audit.service';
import { MatterStatus, LegalRequestStatus } from '@glo/shared';
import type { TenantContext } from '@glo/shared';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

function makeMockInfra() {
  const mattersStore: Array<Record<string, unknown>> = [];
  const requestsStore: Array<Record<string, unknown>> = [];
  const entitiesStore: Array<Record<string, unknown>> = [];
  const linksStore: Array<Record<string, unknown>> = [];
  const auditStore: Array<Record<string, unknown>> = [];

  const txClient = {
    matter: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `mtr-${mattersStore.length + 1}`,
          ...data,
          rowVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mattersStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          mattersStore.find(
            (m) =>
              m.id === where.id &&
              m.organizationId === where.organizationId &&
              (where.deletedAt === null ? m.deletedAt === null : true),
          ) ?? null
        );
      }),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const prefix = (where.matterNumber as { startsWith?: string } | undefined)?.startsWith;
        return mattersStore.filter(
          (m) =>
            m.organizationId === where.organizationId &&
            (prefix ? String(m.matterNumber).startsWith(prefix) : true),
        ).length;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return mattersStore.filter(
          (m) =>
            m.organizationId === where.organizationId &&
            (where.deletedAt === null ? m.deletedAt === null : true),
        );
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = mattersStore.find((m) => m.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { rowVersion: (row.rowVersion as number) + 1 });
        return row;
      }),
    },
    legalRequest: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          requestsStore.find(
            (r) =>
              r.id === where.id &&
              r.organizationId === where.organizationId &&
              (where.deletedAt === null ? r.deletedAt === null : true),
          ) ?? null
        );
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = requestsStore.find((r) => r.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
    },
    legalRequestMatterLink: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `link-${linksStore.length + 1}`, ...data };
        linksStore.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { requestId_matterId: { requestId: string; matterId: string } } }) => {
        return (
          linksStore.find(
            (l) =>
              l.requestId === where.requestId_matterId.requestId &&
              l.matterId === where.requestId_matterId.matterId,
          ) ?? null
        );
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const idx = linksStore.findIndex((l) => l.id === where.id);
        if (idx >= 0) {
          return linksStore.splice(idx, 1)[0];
        }
        throw new Error('link not found');
      }),
    },
    entity: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          entitiesStore.find(
            (e) => e.id === where.id && e.organizationId === where.organizationId,
          ) ?? null
        );
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    matter: txClient.matter,
    legalRequest: txClient.legalRequest,
    legalRequestMatterLink: txClient.legalRequestMatterLink,
    entity: txClient.entity,
  };

  const tenantTx = {
    runInTenantContext: jest.fn(
      async <T>(orgId: string, fn: (tx: typeof txClient) => Promise<T>) => fn(txClient),
    ),
  };

  const audit = {
    append: jest.fn(async (input: Record<string, unknown>) => {
      const entry = { id: `audit-${auditStore.length + 1}`, ...input };
      auditStore.push(entry);
      return entry;
    }),
  };

  const seedEntity = (id: string, orgId: string) => {
    entitiesStore.push({ id, organizationId: orgId, deletedAt: null });
  };
  const seedMatter = (id: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id,
      organizationId: orgId,
      entityId: null,
      matterNumber: `MTR-2026-${String(mattersStore.length + 1).padStart(4, '0')}`,
      title: 'Test Matter',
      titleEn: null,
      description: null,
      type: null,
      status: MatterStatus.open,
      priority: 'medium',
      assignedTo: null,
      responsibleUser: null,
      classification: 'internal',
      deletedAt: null,
      deletedBy: null,
      rowVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    mattersStore.push(row);
    return row;
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
    stores: { mattersStore, requestsStore, entitiesStore, linksStore, auditStore },
    seedEntity,
    seedMatter,
    seedRequest,
  };
}

const makeCtx = (overrides: Partial<TenantContext> = {}): TenantContext => ({
  organizationId: 'org-1',
  userId: 'user-1',
  roles: [],
  ...overrides,
});

describe('MattersService', () => {
  let service: MattersService;
  let mock: ReturnType<typeof makeMockInfra>;

  beforeEach(async () => {
    mock = makeMockInfra();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MattersService,
        { provide: PrismaService, useValue: mock.prisma },
        { provide: TenantTransactionService, useValue: mock.tenantTx },
        { provide: AuditService, useValue: mock.audit },
      ],
    }).compile();
    service = module.get(MattersService);
  });

  describe('create', () => {
    it('creates an open matter with a generated matter number', async () => {
      const m = await service.create(makeCtx(), { title: 'Test Matter' });
      expect(m.status).toBe(MatterStatus.open);
      expect(m.matterNumber).toMatch(/^MTR-\d{4}-\d{4}$/);
      expect(mock.audit.append).toHaveBeenCalledTimes(1);
    });

    it('throws NotFound when entityId does not belong to the org', async () => {
      await expect(
        service.create(makeCtx(), { title: 'X', entityId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('transition', () => {
    it('transitions open → in_progress', async () => {
      mock.seedMatter('mtr-1', 'org-1', { status: MatterStatus.open });
      const updated = await service.transition(makeCtx(), 'mtr-1', MatterStatus.in_progress);
      expect(updated.status).toBe(MatterStatus.in_progress);
    });

    it('transitions in_progress → resolved', async () => {
      mock.seedMatter('mtr-1', 'org-1', { status: MatterStatus.in_progress });
      const updated = await service.transition(makeCtx(), 'mtr-1', MatterStatus.resolved);
      expect(updated.status).toBe(MatterStatus.resolved);
    });

    it('transitions resolved → closed', async () => {
      mock.seedMatter('mtr-1', 'org-1', { status: MatterStatus.resolved });
      const updated = await service.transition(makeCtx(), 'mtr-1', MatterStatus.closed);
      expect(updated.status).toBe(MatterStatus.closed);
    });

    it('throws BadRequest for invalid transition (open → resolved)', async () => {
      mock.seedMatter('mtr-1', 'org-1', { status: MatterStatus.open });
      await expect(
        service.transition(makeCtx(), 'mtr-1', MatterStatus.resolved),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest for terminal → any (archived → in_progress)', async () => {
      mock.seedMatter('mtr-1', 'org-1', { status: MatterStatus.archived });
      await expect(
        service.transition(makeCtx(), 'mtr-1', MatterStatus.in_progress),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound for matter from a different org (RLS)', async () => {
      mock.seedMatter('mtr-1', 'org-OTHER', { status: MatterStatus.open });
      await expect(
        service.transition(makeCtx(), 'mtr-1', MatterStatus.in_progress),
      ).rejects.toThrow(NotFoundException);
    });

    it('is idempotent when transitioning to the same status', async () => {
      mock.seedMatter('mtr-1', 'org-1', { status: MatterStatus.open });
      const result = await service.transition(makeCtx(), 'mtr-1', MatterStatus.open);
      expect(result.status).toBe(MatterStatus.open);
      expect(mock.audit.append).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates an open matter', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      const updated = await service.update(makeCtx(), 'mtr-1', { title: 'Updated' });
      expect(updated.title).toBe('Updated');
    });

    it('throws Conflict when rowVersion mismatch', async () => {
      mock.seedMatter('mtr-1', 'org-1', { rowVersion: 5 });
      await expect(
        service.update(makeCtx(), 'mtr-1', { title: 'X', rowVersion: 3 }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequest when updating an archived matter', async () => {
      mock.seedMatter('mtr-1', 'org-1', { status: MatterStatus.archived });
      await expect(
        service.update(makeCtx(), 'mtr-1', { title: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('linkRequest', () => {
    it('links a request to a matter', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.in_progress });
      const link = await service.linkRequest(makeCtx(), 'mtr-1', 'req-1');
      expect(link.requestId).toBe('req-1');
      expect(link.matterId).toBe('mtr-1');
    });

    it('throws Conflict when link already exists', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      mock.seedRequest('req-1', 'org-1');
      await service.linkRequest(makeCtx(), 'mtr-1', 'req-1');
      await expect(
        service.linkRequest(makeCtx(), 'mtr-1', 'req-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFound when matter does not exist', async () => {
      mock.seedRequest('req-1', 'org-1');
      await expect(
        service.linkRequest(makeCtx(), 'non-existent', 'req-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when request does not exist', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      await expect(
        service.linkRequest(makeCtx(), 'mtr-1', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('unlinkRequest', () => {
    it('removes an existing link', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      mock.seedRequest('req-1', 'org-1');
      await service.linkRequest(makeCtx(), 'mtr-1', 'req-1');
      const result = await service.unlinkRequest(makeCtx(), 'mtr-1', 'req-1');
      expect(result.success).toBe(true);
    });

    it('throws NotFound when link does not exist', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      await expect(
        service.unlinkRequest(makeCtx(), 'mtr-1', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('convertRequestToMatter', () => {
    it('converts an in_progress request to a new matter', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.in_progress });
      const result = await service.convertRequestToMatter(makeCtx(), 'req-1', {});
      expect(result.matter.status).toBe(MatterStatus.in_progress);
      expect(result.matter.title).toBe('Test Request'); // inherited from request
      expect(result.requestId).toBe('req-1');
      // Verify the request was transitioned to converted_to_matter
      const req = mock.stores.requestsStore[0]!;
      expect(req.status).toBe(LegalRequestStatus.converted_to_matter);
      // Verify a link was created
      expect(mock.stores.linksStore).toHaveLength(1);
      // Verify two audit entries (create matter + update request)
      expect(mock.audit.append).toHaveBeenCalledTimes(2);
    });

    it('converts a triaged request to a new matter', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.triaged });
      const result = await service.convertRequestToMatter(makeCtx(), 'req-1', {});
      expect(result.matter).toBeDefined();
    });

    it('throws BadRequest when converting a draft request', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.draft });
      await expect(
        service.convertRequestToMatter(makeCtx(), 'req-1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest when converting a closed request', async () => {
      mock.seedRequest('req-1', 'org-1', { status: LegalRequestStatus.closed });
      await expect(
        service.convertRequestToMatter(makeCtx(), 'req-1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses provided overrides (title, priority) instead of request values', async () => {
      mock.seedRequest('req-1', 'org-1', {
        status: LegalRequestStatus.in_progress,
        title: 'Original Title',
        priority: 'low',
      });
      const result = await service.convertRequestToMatter(makeCtx(), 'req-1', {
        title: 'Override Title',
        priority: 'high',
      });
      expect(result.matter.title).toBe('Override Title');
      expect(result.matter.priority).toBe('high');
    });
  });

  describe('findOne', () => {
    it('returns the matter with includes', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      const m = await service.findOne(makeCtx(), 'mtr-1');
      expect(m.id).toBe('mtr-1');
    });

    it('throws NotFound for non-existent matter', async () => {
      await expect(
        service.findOne(makeCtx(), 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound for matter from a different org (RLS)', async () => {
      mock.seedMatter('mtr-1', 'org-OTHER');
      await expect(
        service.findOne(makeCtx(), 'mtr-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns paginated matters for the current tenant only', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      mock.seedMatter('mtr-2', 'org-1');
      mock.seedMatter('mtr-3', 'org-OTHER');
      const result = await service.list(makeCtx(), { page: 1, limit: 10 });
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });
  });
});
