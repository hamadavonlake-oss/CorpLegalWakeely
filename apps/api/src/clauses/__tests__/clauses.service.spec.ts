import { Test, TestingModule } from '@nestjs/testing';
import { ClausesService } from '../clauses.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { AuditService } from '../../audit/audit.service';
import type { TenantContext } from '@glo/shared';
import { NotFoundException, ConflictException } from '@nestjs/common';

function makeMockInfra() {
  const clausesStore: Array<Record<string, unknown>> = [];
  const auditStore: Array<Record<string, unknown>> = [];

  const txClient = {
    clause: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `clause-${clausesStore.length + 1}`,
          ...data,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        clausesStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          clausesStore.find(
            (c) =>
              (where.id ? c.id === where.id : true) &&
              (where.organizationId ? c.organizationId === where.organizationId : true) &&
              (where.deletedAt === null ? c.deletedAt === null : true),
          ) ?? null
        );
      }),
      findUnique: jest.fn(async ({ where }: { where: { organizationId_code: { organizationId: string; code: string } } }) => {
        return (
          clausesStore.find(
            (c) =>
              c.organizationId === where.organizationId_code.organizationId &&
              c.code === where.organizationId_code.code,
          ) ?? null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return clausesStore.filter(
          (c) =>
            c.organizationId === where.organizationId &&
            (where.deletedAt === null ? c.deletedAt === null : true) &&
            (where.category ? c.category === where.category : true) &&
            (where.isActive !== undefined ? c.isActive === where.isActive : true),
        );
      }),
      count: jest.fn(async () => clausesStore.length),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = clausesStore.find((c) => c.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { rowVersion: (row.rowVersion as number) + 1 });
        return row;
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    clause: txClient.clause,
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

  const seedClause = (id: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id,
      organizationId: orgId,
      code: `C-${clausesStore.length + 1}`,
      title: 'Test Clause',
      titleEn: null,
      category: 'boilerplate',
      bodyText: 'Default body text',
      bodyTextEn: null,
      variables: null,
      countryCode: null,
      isActive: true,
      version: 1,
      createdBy: 'user-1',
      deletedAt: null,
      deletedBy: null,
      rowVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    clausesStore.push(row);
    return row;
  };

  return {
    prisma,
    tenantTx,
    audit,
    txClient,
    stores: { clausesStore, auditStore },
    seedClause,
  };
}

const makeCtx = (overrides: Partial<TenantContext> = {}): TenantContext => ({
  organizationId: 'org-1',
  userId: 'user-1',
  roles: [],
  ...overrides,
});

describe('ClausesService', () => {
  let service: ClausesService;
  let mock: ReturnType<typeof makeMockInfra>;

  beforeEach(async () => {
    mock = makeMockInfra();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClausesService,
        { provide: PrismaService, useValue: mock.prisma },
        { provide: TenantTransactionService, useValue: mock.tenantTx },
        { provide: AuditService, useValue: mock.audit },
      ],
    }).compile();
    service = module.get(ClausesService);
  });

  describe('create', () => {
    it('creates a clause', async () => {
      const c = await service.create(makeCtx(), {
        code: 'TERM-001',
        title: 'Termination Clause',
        category: 'termination',
        bodyText: 'Either party may terminate this agreement with 30 days notice.',
      });
      expect(c.code).toBe('TERM-001');
      expect(c.category).toBe('termination');
      expect(mock.audit.append).toHaveBeenCalledTimes(1);
    });

    it('throws Conflict when code already exists', async () => {
      mock.seedClause('c-1', 'org-1', { code: 'TERM-001' });
      await expect(
        service.create(makeCtx(), {
          code: 'TERM-001',
          title: 'X',
          category: 'termination',
          bodyText: 'X',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('returns the clause', async () => {
      mock.seedClause('c-1', 'org-1');
      const c = await service.findOne(makeCtx(), 'c-1');
      expect(c.id).toBe('c-1');
    });

    it('throws NotFound for non-existent clause', async () => {
      await expect(service.findOne(makeCtx(), 'nope')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound for clause from a different org (RLS)', async () => {
      mock.seedClause('c-1', 'org-OTHER');
      await expect(service.findOne(makeCtx(), 'c-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates title and description', async () => {
      mock.seedClause('c-1', 'org-1');
      const updated = await service.update(makeCtx(), 'c-1', { title: 'Updated' });
      expect(updated.title).toBe('Updated');
    });

    it('increments version when bodyText changes', async () => {
      mock.seedClause('c-1', 'org-1', { version: 1, bodyText: 'old text' });
      const updated = await service.update(makeCtx(), 'c-1', { bodyText: 'new text' });
      expect(updated.version).toBe(2);
    });

    it('does NOT increment version when bodyText unchanged', async () => {
      mock.seedClause('c-1', 'org-1', { version: 1, bodyText: 'same text' });
      const updated = await service.update(makeCtx(), 'c-1', { bodyText: 'same text' });
      expect(updated.version).toBe(1);
    });

    it('throws Conflict when rowVersion mismatch', async () => {
      mock.seedClause('c-1', 'org-1', { rowVersion: 5 });
      await expect(
        service.update(makeCtx(), 'c-1', { title: 'X', rowVersion: 3 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDelete', () => {
    it('soft-deletes a clause', async () => {
      mock.seedClause('c-1', 'org-1');
      const result = await service.softDelete(makeCtx(), 'c-1');
      expect(result.success).toBe(true);
      expect(mock.stores.clausesStore[0]!.deletedAt).toBeTruthy();
      expect(mock.stores.clausesStore[0]!.isActive).toBe(false);
    });
  });

  describe('list', () => {
    it('returns clauses for the current tenant only', async () => {
      mock.seedClause('c-1', 'org-1');
      mock.seedClause('c-2', 'org-1');
      mock.seedClause('c-3', 'org-OTHER');
      const result = await service.list(makeCtx(), { page: 1, limit: 10 });
      expect(result.data).toHaveLength(2);
    });

    it('filters by category', async () => {
      mock.seedClause('c-1', 'org-1', { category: 'termination' });
      mock.seedClause('c-2', 'org-1', { category: 'confidentiality' });
      const result = await service.list(makeCtx(), { page: 1, limit: 10, category: 'termination' });
      expect(result.data).toHaveLength(1);
    });
  });
});
