import { Test, TestingModule } from '@nestjs/testing';
import { DeadlinesService } from '../deadlines.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import type { TenantContext } from '@glo/shared';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

function makeMockInfra() {
  const deadlinesStore: Array<Record<string, unknown>> = [];
  const mattersStore: Array<Record<string, unknown>> = [];
  const contractsStore: Array<Record<string, unknown>> = [];
  const requestsStore: Array<Record<string, unknown>> = [];
  const usersStore: Array<Record<string, unknown>> = [];

  const txClient = {
    deadline: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `dl-${deadlinesStore.length + 1}`, ...data, rowVersion: 0, createdAt: new Date(), updatedAt: new Date() };
        deadlinesStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return deadlinesStore.find(
          (d) => d.id === where.id && d.organizationId === where.organizationId && (where.deletedAt === null ? d.deletedAt === null : true),
        ) ?? null;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return deadlinesStore.filter(
          (d) =>
            d.organizationId === where.organizationId &&
            (where.deletedAt === null ? d.deletedAt === null : true) &&
            (where.status ? d.status === where.status : true) &&
            (where.parentType ? d.parentType === where.parentType : true) &&
            (where.parentId ? d.parentId === where.parentId : true),
        );
      }),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return deadlinesStore.filter(
          (d) =>
            d.organizationId === where.organizationId &&
            (where.deletedAt === null ? d.deletedAt === null : true) &&
            (where.status ? d.status === where.status : true),
        ).length;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = deadlinesStore.find((d) => d.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { rowVersion: (row.rowVersion as number) + 1 });
        return row;
      }),
    },
    matter: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return mattersStore.find((m) => m.id === where.id && m.organizationId === where.organizationId && m.deletedAt === null) ?? null;
      }),
    },
    contract: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return contractsStore.find((c) => c.id === where.id && c.organizationId === where.organizationId && c.deletedAt === null) ?? null;
      }),
    },
    legalRequest: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return requestsStore.find((r) => r.id === where.id && r.organizationId === where.organizationId && r.deletedAt === null) ?? null;
      }),
    },
    user: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return usersStore.find((u) => u.id === where.id && u.organizationId === where.organizationId && u.deletedAt === null) ?? null;
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    deadline: {
      findMany: jest.fn(async () => deadlinesStore.filter((d) => d.status === 'pending' && !d.reminderSent && !d.deletedAt).map((d) => ({ organizationId: d.organizationId }))),
    },
  };

  const tenantTx = {
    runInTenantContext: jest.fn(async <T>(orgId: string, fn: (tx: typeof txClient) => Promise<T>) => fn(txClient)),
  };

  const audit = { append: jest.fn(async () => ({})) };
  const notifications = { create: jest.fn(async () => ({})) };

  const seedMatter = (id: string, orgId: string) => mattersStore.push({ id, organizationId: orgId, deletedAt: null });
  const seedContract = (id: string, orgId: string) => contractsStore.push({ id, organizationId: orgId, deletedAt: null });
  const seedRequest = (id: string, orgId: string) => requestsStore.push({ id, organizationId: orgId, deletedAt: null });
  const seedUser = (id: string, orgId: string) => usersStore.push({ id, organizationId: orgId, deletedAt: null });
  const seedDeadline = (id: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    deadlinesStore.push({
      id, organizationId: orgId, parentType: 'matter', parentId: 'mtr-1',
      title: 'Test Deadline', titleEn: null, description: null,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      reminderDays: 7, reminderSent: false, assignedTo: null,
      status: 'pending', completedAt: null, priority: 'medium',
      createdBy: 'user-1', deletedAt: null, deletedBy: null, rowVersion: 0,
      createdAt: new Date(), updatedAt: new Date(),
      ...overrides,
    });
  };

  return {
    prisma, tenantTx, audit, notifications, txClient,
    stores: { deadlinesStore, mattersStore, contractsStore, requestsStore, usersStore },
    seedMatter, seedContract, seedRequest, seedUser, seedDeadline,
  };
}

const makeCtx = (): TenantContext => ({ organizationId: 'org-1', userId: 'user-1', roles: [] });

describe('DeadlinesService', () => {
  let service: DeadlinesService;
  let mock: ReturnType<typeof makeMockInfra>;

  beforeEach(async () => {
    mock = makeMockInfra();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadlinesService,
        { provide: PrismaService, useValue: mock.prisma },
        { provide: TenantTransactionService, useValue: mock.tenantTx },
        { provide: AuditService, useValue: mock.audit },
        { provide: NotificationsService, useValue: mock.notifications },
      ],
    }).compile();
    service = module.get(DeadlinesService);
  });

  describe('create', () => {
    it('creates a deadline for a valid matter', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      const d = await service.create(makeCtx(), {
        parentType: 'matter', parentId: 'mtr-1',
        title: 'Filing deadline', dueDate: '2026-12-31T00:00:00.000Z',
      });
      expect(d.title).toBe('Filing deadline');
      expect(d.status).toBe('pending');
      expect(mock.audit.append).toHaveBeenCalledTimes(1);
    });

    it('creates a deadline for a valid contract', async () => {
      mock.seedContract('ctr-1', 'org-1');
      const d = await service.create(makeCtx(), {
        parentType: 'contract', parentId: 'ctr-1',
        title: 'Renewal deadline', dueDate: '2026-06-30T00:00:00.000Z',
      });
      expect(d.parentType).toBe('contract');
    });

    it('throws NotFound when parent does not exist', async () => {
      await expect(
        service.create(makeCtx(), {
          parentType: 'matter', parentId: 'non-existent',
          title: 'X', dueDate: '2026-12-31T00:00:00.000Z',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest for invalid parent type', async () => {
      await expect(
        service.create(makeCtx(), {
          parentType: 'invalid' as 'matter', parentId: 'x',
          title: 'X', dueDate: '2026-12-31T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when assignedTo user does not exist', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      await expect(
        service.create(makeCtx(), {
          parentType: 'matter', parentId: 'mtr-1',
          title: 'X', dueDate: '2026-12-31T00:00:00.000Z',
          assignedTo: 'non-existent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('accepts valid assignedTo', async () => {
      mock.seedMatter('mtr-1', 'org-1');
      mock.seedUser('user-2', 'org-1');
      const d = await service.create(makeCtx(), {
        parentType: 'matter', parentId: 'mtr-1',
        title: 'X', dueDate: '2026-12-31T00:00:00.000Z',
        assignedTo: 'user-2',
      });
      expect(d.assignedTo).toBe('user-2');
    });
  });

  describe('update', () => {
    it('updates a deadline title', async () => {
      mock.seedDeadline('dl-1', 'org-1');
      const d = await service.update(makeCtx(), 'dl-1', { title: 'Updated' });
      expect(d.title).toBe('Updated');
    });

    it('marks as completed + sets completedAt', async () => {
      mock.seedDeadline('dl-1', 'org-1');
      const d = await service.update(makeCtx(), 'dl-1', { status: 'completed' });
      expect(d.status).toBe('completed');
      expect(d.completedAt).toBeTruthy();
    });

    it('throws Conflict on rowVersion mismatch', async () => {
      mock.seedDeadline('dl-1', 'org-1', { rowVersion: 5 });
      await expect(
        service.update(makeCtx(), 'dl-1', { title: 'X', rowVersion: 3 }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFound for non-existent deadline', async () => {
      await expect(
        service.update(makeCtx(), 'non-existent', { title: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('returns the deadline', async () => {
      mock.seedDeadline('dl-1', 'org-1');
      const d = await service.findOne(makeCtx(), 'dl-1');
      expect(d.id).toBe('dl-1');
    });

    it('throws NotFound for non-existent', async () => {
      await expect(service.findOne(makeCtx(), 'non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns deadlines for the current tenant', async () => {
      mock.seedDeadline('dl-1', 'org-1');
      mock.seedDeadline('dl-2', 'org-1');
      const result = await service.list(makeCtx(), { page: 1, limit: 10 });
      expect(result.data).toHaveLength(2);
    });

    it('filters by status', async () => {
      mock.seedDeadline('dl-1', 'org-1', { status: 'pending' });
      mock.seedDeadline('dl-2', 'org-1', { status: 'completed' });
      const result = await service.list(makeCtx(), { page: 1, limit: 10, status: 'pending' });
      expect(result.data).toHaveLength(1);
    });
  });

  describe('softDelete', () => {
    it('soft-deletes a deadline', async () => {
      mock.seedDeadline('dl-1', 'org-1');
      const result = await service.softDelete(makeCtx(), 'dl-1');
      expect(result.success).toBe(true);
      expect(mock.stores.deadlinesStore[0]!.deletedAt).toBeTruthy();
      expect(mock.stores.deadlinesStore[0]!.status).toBe('cancelled');
    });
  });

  describe('processReminders', () => {
    it('sends reminder when deadline is within reminderDays', async () => {
      // Deadline due in 5 days, reminderDays = 7 → should trigger
      mock.seedDeadline('dl-1', 'org-1', {
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        reminderDays: 7,
        assignedTo: 'user-2',
      });
      mock.seedUser('user-2', 'org-1');

      const result = await service.processReminders();
      expect(result.sent).toBe(1);
      expect(mock.notifications.create).toHaveBeenCalledTimes(1);
      // Verify reminderSent flag was set
      expect(mock.stores.deadlinesStore[0]!.reminderSent).toBe(true);
    });

    it('marks overdue when past due date', async () => {
      // Deadline was due 5 days ago
      mock.seedDeadline('dl-1', 'org-1', {
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        assignedTo: 'user-2',
      });
      mock.seedUser('user-2', 'org-1');

      const result = await service.processReminders();
      expect(result.overdue).toBe(1);
      expect(mock.stores.deadlinesStore[0]!.status).toBe('overdue');
      expect(mock.notifications.create).toHaveBeenCalledTimes(1);
    });

    it('does NOT send reminder when not within reminderDays window', async () => {
      // Deadline due in 30 days, reminderDays = 7 → should NOT trigger
      mock.seedDeadline('dl-1', 'org-1', {
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        reminderDays: 7,
      });

      const result = await service.processReminders();
      expect(result.sent).toBe(0);
      expect(result.overdue).toBe(0);
      expect(mock.notifications.create).not.toHaveBeenCalled();
    });

    it('does NOT re-send reminder when reminderSent is already true', async () => {
      mock.seedDeadline('dl-1', 'org-1', {
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        reminderDays: 7,
        reminderSent: true,
      });

      const result = await service.processReminders();
      expect(result.sent).toBe(0);
      expect(mock.notifications.create).not.toHaveBeenCalled();
    });
  });
});
