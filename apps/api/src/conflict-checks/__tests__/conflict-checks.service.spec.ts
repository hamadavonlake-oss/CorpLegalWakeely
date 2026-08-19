import { Test, TestingModule } from '@nestjs/testing';
import { ConflictChecksService } from '../conflict-checks.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { AuditService } from '../../audit/audit.service';
import { ConflictCheckStatus } from '@glo/shared';
import type { TenantContext } from '@glo/shared';
import { Prisma } from '@prisma/client';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

function makeMockInfra() {
  const checksStore: Array<Record<string, unknown>> = [];
  const mattersStore: Array<Record<string, unknown>> = [];
  const auditStore: Array<Record<string, unknown>> = [];

  const txClient = {
    conflictCheck: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `cc-${checksStore.length + 1}`,
          ...data,
          rowVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        checksStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          checksStore.find(
            (c) =>
              // Match by id if provided
              (where.id ? c.id === where.id : true) &&
              // Match by organizationId (RLS)
              (where.organizationId ? c.organizationId === where.organizationId : true) &&
              // Match by parentType + parentId if provided (findByParent)
              (where.parentType ? c.parentType === where.parentType : true) &&
              (where.parentId ? c.parentId === where.parentId : true) &&
              (where.deletedAt === null ? c.deletedAt === null : true),
          ) ?? null
        );
      }),
      findUnique: jest.fn(async ({ where }: { where: { parentType_parentId: { parentType: string; parentId: string } } }) => {
        return (
          checksStore.find(
            (c) =>
              c.parentType === where.parentType_parentId.parentType &&
              c.parentId === where.parentType_parentId.parentId,
          ) ?? null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return checksStore.filter(
          (c) =>
            c.organizationId === where.organizationId &&
            (where.deletedAt === null ? c.deletedAt === null : true),
        );
      }),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return checksStore.filter(
          (c) =>
            (where.organizationId ? c.organizationId === where.organizationId : true) &&
            (where.deletedAt === null ? c.deletedAt === null : true),
        ).length;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = checksStore.find((c) => c.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { rowVersion: (row.rowVersion as number) + 1 });
        return row;
      }),
    },
    matter: {
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
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    conflictCheck: txClient.conflictCheck,
    matter: txClient.matter,
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

  const seedMatter = (id: string, orgId: string) => {
    mattersStore.push({ id, organizationId: orgId, deletedAt: null, matterNumber: `MTR-X` });
  };
  const seedCheck = (id: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id,
      organizationId: orgId,
      parentType: 'matter',
      parentId: 'mtr-1',
      status: ConflictCheckStatus.not_checked,
      names: [{ name: 'Test', nameEn: 'Test' }],
      registrationNumbers: null,
      notes: null,
      checkedBy: null,
      checkedAt: null,
      resultSummary: null,
      deletedAt: null,
      deletedBy: null,
      rowVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    checksStore.push(row);
    return row;
  };

  return {
    prisma,
    tenantTx,
    audit,
    txClient,
    stores: { checksStore, mattersStore, auditStore },
    seedMatter,
    seedCheck,
  };
}

const makeCtx = (overrides: Partial<TenantContext> = {}): TenantContext => ({
  organizationId: 'org-1',
  userId: 'user-1',
  roles: [],
  ...overrides,
});

describe('ConflictChecksService', () => {
  let service: ConflictChecksService;
  let mock: ReturnType<typeof makeMockInfra>;

  beforeEach(async () => {
    mock = makeMockInfra();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConflictChecksService,
        { provide: PrismaService, useValue: mock.prisma },
        { provide: TenantTransactionService, useValue: mock.tenantTx },
        { provide: AuditService, useValue: mock.audit },
      ],
    }).compile();
    service = module.get(ConflictChecksService);
  });

  describe('create', () => {
    it('creates a conflict check for an existing matter', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      const check = await service.create(makeCtx(), {
        parentType: 'matter',
        parentId: 'mtr-1',
        names: [{ name: 'الشركة الأولى', nameEn: 'First Co.' }],
        registrationNumbers: ['CR-001'],
      });
      expect(check.status).toBe(ConflictCheckStatus.not_checked);
      expect(check.parentType).toBe('matter');
      expect(mock.audit.append).toHaveBeenCalledTimes(1);
    });

    it('throws NotFound when matter does not belong to org', async () => {
      await expect(
        service.create(makeCtx(), {
          parentType: 'matter',
          parentId: 'non-existent',
          names: [{ name: 'X' }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest for unsupported parentType (contract not yet supported)', async () => {
      await expect(
        service.create(makeCtx(), {
          parentType: 'contract' as 'matter',
          parentId: 'anything',
          names: [{ name: 'X' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws Conflict when a check already exists for this parent', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      await service.create(makeCtx(), {
        parentType: 'matter',
        parentId: 'mtr-1',
        names: [{ name: 'X' }],
      });
      await expect(
        service.create(makeCtx(), {
          parentType: 'matter',
          parentId: 'mtr-1',
          names: [{ name: 'Y' }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequest when no names provided', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      await expect(
        service.create(makeCtx(), {
          parentType: 'matter',
          parentId: 'mtr-1',
          names: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('transition', () => {
    it('transitions not_checked → no_match', async () => {
      mock.seedCheck('cc-1', 'org-1', { status: ConflictCheckStatus.not_checked });
      const updated = await service.transition(makeCtx(), 'cc-1', ConflictCheckStatus.no_match);
      expect(updated.status).toBe(ConflictCheckStatus.no_match);
      expect(updated.checkedAt).toBeTruthy();
      expect(updated.checkedBy).toBe('user-1');
    });

    it('transitions not_checked → blocked', async () => {
      mock.seedCheck('cc-1', 'org-1', { status: ConflictCheckStatus.not_checked });
      const updated = await service.transition(makeCtx(), 'cc-1', ConflictCheckStatus.blocked);
      expect(updated.status).toBe(ConflictCheckStatus.blocked);
    });

    it('transitions not_checked → possible_match', async () => {
      mock.seedCheck('cc-1', 'org-1', { status: ConflictCheckStatus.not_checked });
      const updated = await service.transition(
        makeCtx(),
        'cc-1',
        ConflictCheckStatus.possible_match,
        { resultSummary: 'Potential overlap identified' },
      );
      expect(updated.status).toBe(ConflictCheckStatus.possible_match);
      expect(updated.resultSummary).toBe('Potential overlap identified');
    });

    it('resets to not_checked (clears checkedAt, checkedBy, resultSummary)', async () => {
      mock.seedCheck('cc-1', 'org-1', {
        status: ConflictCheckStatus.no_match,
        checkedAt: new Date(),
        checkedBy: 'user-1',
        resultSummary: 'Done',
      });
      const updated = await service.transition(
        makeCtx(),
        'cc-1',
        ConflictCheckStatus.not_checked,
      );
      expect(updated.status).toBe(ConflictCheckStatus.not_checked);
      expect(updated.checkedAt).toBeNull();
      expect(updated.checkedBy).toBeNull();
      expect(updated.resultSummary).toBeNull();
    });

    it('throws BadRequest for invalid transition (no_match → cleared_by_lawyer)', async () => {
      mock.seedCheck('cc-1', 'org-1', { status: ConflictCheckStatus.no_match });
      await expect(
        service.transition(makeCtx(), 'cc-1', ConflictCheckStatus.cleared_by_lawyer),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound for check from a different org (RLS)', async () => {
      mock.seedCheck('cc-1', 'org-OTHER', { status: ConflictCheckStatus.not_checked });
      await expect(
        service.transition(makeCtx(), 'cc-1', ConflictCheckStatus.no_match),
      ).rejects.toThrow(NotFoundException);
    });

    it('is idempotent when transitioning to the same status', async () => {
      mock.seedCheck('cc-1', 'org-1', { status: ConflictCheckStatus.not_checked });
      const result = await service.transition(
        makeCtx(),
        'cc-1',
        ConflictCheckStatus.not_checked,
      );
      expect(result.status).toBe(ConflictCheckStatus.not_checked);
      expect(mock.audit.append).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates notes on a non_blocked check', async () => {
      mock.seedCheck('cc-1', 'org-1', { status: ConflictCheckStatus.not_checked });
      const updated = await service.update(makeCtx(), 'cc-1', { notes: 'New notes' });
      expect(updated.notes).toBe('New notes');
    });

    it('throws BadRequest when updating a blocked check', async () => {
      mock.seedCheck('cc-1', 'org-1', { status: ConflictCheckStatus.blocked });
      await expect(
        service.update(makeCtx(), 'cc-1', { notes: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('softDelete', () => {
    it('deletes a not_checked check', async () => {
      mock.seedCheck('cc-1', 'org-1', { status: ConflictCheckStatus.not_checked });
      const result = await service.softDelete(makeCtx(), 'cc-1');
      expect(result.success).toBe(true);
    });

    it('throws BadRequest when deleting a blocked check', async () => {
      mock.seedCheck('cc-1', 'org-1', { status: ConflictCheckStatus.blocked });
      await expect(
        service.softDelete(makeCtx(), 'cc-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest when deleting a possible_match check', async () => {
      mock.seedCheck('cc-1', 'org-1', { status: ConflictCheckStatus.possible_match });
      await expect(
        service.softDelete(makeCtx(), 'cc-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('deletes a no_match check (not active)', async () => {
      mock.seedCheck('cc-1', 'org-1', { status: ConflictCheckStatus.no_match });
      const result = await service.softDelete(makeCtx(), 'cc-1');
      expect(result.success).toBe(true);
    });
  });

  describe('findOne', () => {
    it('returns the check', async () => {
      mock.seedCheck('cc-1', 'org-1');
      const check = await service.findOne(makeCtx(), 'cc-1');
      expect(check.id).toBe('cc-1');
    });

    it('throws NotFound for non-existent check', async () => {
      await expect(
        service.findOne(makeCtx(), 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound for check from a different org (RLS)', async () => {
      mock.seedCheck('cc-1', 'org-OTHER');
      await expect(
        service.findOne(makeCtx(), 'cc-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByParent', () => {
    it('returns the check for a given matter', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      mock.seedCheck('cc-1', 'org-1', { parentType: 'matter', parentId: 'mtr-1' });
      const check = await service.findByParent(makeCtx(), 'matter', 'mtr-1');
      expect(check.id).toBe('cc-1');
    });

    it('throws NotFound when no check exists for the parent', async () => {
      await expect(
        service.findByParent(makeCtx(), 'matter', 'mtr-non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns paginated checks for the current tenant only', async () => {
      mock.seedCheck('cc-1', 'org-1');
      mock.seedCheck('cc-2', 'org-1');
      mock.seedCheck('cc-3', 'org-OTHER');
      const result = await service.list(makeCtx(), { page: 1, limit: 10 });
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });
  });
});
