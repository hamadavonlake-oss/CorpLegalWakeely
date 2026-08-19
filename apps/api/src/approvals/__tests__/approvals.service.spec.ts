import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalsService } from '../approvals.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { AuditService } from '../../audit/audit.service';
import { ContractStatus } from '@glo/shared';
import type { TenantContext } from '@glo/shared';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

function makeMockInfra() {
  const rulesStore: Array<Record<string, unknown>> = [];
  const conditionsStore: Array<Record<string, unknown>> = [];
  const ruleStepsStore: Array<Record<string, unknown>> = [];
  const instancesStore: Array<Record<string, unknown>> = [];
  const instanceStepsStore: Array<Record<string, unknown>> = [];
  const contractsStore: Array<Record<string, unknown>> = [];
  const documentsStore: Array<Record<string, unknown>> = [];
  const usersStore: Array<Record<string, unknown>> = [];
  const userRolesStore: Array<Record<string, unknown>> = [];
  const rolesStore: Array<Record<string, unknown>> = [];
  const auditStore: Array<Record<string, unknown>> = [];

  let idCounter = 0;
  const newId = (prefix: string) => `${prefix}-${++idCounter}`;

  const txClient = {
    approvalRule: {
      create: jest.fn(async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, unknown> }) => {
        // Build the base row WITHOUT the nested create objects
        const conditionsInput = data.conditions as { create?: Record<string, unknown>[] } | undefined;
        const stepsInput = data.steps as { create?: Record<string, unknown>[] } | undefined;
        const baseData = { ...data };
        delete baseData.conditions;
        delete baseData.steps;

        const row: Record<string, unknown> = {
          id: newId('rule'),
          ...baseData,
          rowVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          conditions: [] as Array<Record<string, unknown>>,
          steps: [] as Array<Record<string, unknown>>,
        };
        rulesStore.push(row);

        // Handle nested creates for conditions and steps
        if (conditionsInput?.create) {
          for (const c of conditionsInput.create) {
            const cond = { id: newId('cond'), ruleId: row.id, ...c, createdAt: new Date() };
            conditionsStore.push(cond);
            (row.conditions as Array<Record<string, unknown>>).push(cond);
          }
        }
        if (stepsInput?.create) {
          for (const s of stepsInput.create) {
            const step = { id: newId('rstep'), ruleId: row.id, ...s, createdAt: new Date(), updatedAt: new Date() };
            ruleStepsStore.push(step);
            (row.steps as Array<Record<string, unknown>>).push(step);
          }
        }

        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          rulesStore.find(
            (r) =>
              (where.id ? r.id === where.id : true) &&
              (where.organizationId ? r.organizationId === where.organizationId : true) &&
              (where.deletedAt === null ? r.deletedAt === null : true) &&
              (where.objectType ? r.objectType === where.objectType : true) &&
              (where.isActive !== undefined ? r.isActive === where.isActive : true),
          ) ?? null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const rules = rulesStore.filter(
          (r) =>
            r.organizationId === where.organizationId &&
            (where.deletedAt === null ? r.deletedAt === null : true) &&
            (where.objectType ? r.objectType === where.objectType : true) &&
            (where.isActive !== undefined ? r.isActive === where.isActive : true),
        );
        // Sort by priority ascending
        rules.sort((a, b) => (a.priority as number) - (b.priority as number));
        // Attach conditions + steps
        return rules.map((r) => ({
          ...r,
          conditions: conditionsStore.filter((c) => c.ruleId === r.id),
          steps: ruleStepsStore
            .filter((s) => s.ruleId === r.id)
            .sort((a, b) => (a.stepOrder as number) - (b.stepOrder as number)),
        }));
      }),
      count: jest.fn(async () => rulesStore.length),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rulesStore.find((r) => r.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { rowVersion: (row.rowVersion as number) + 1 });
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        return rulesStore.find((r) => r.id === where.id) ?? null;
      }),
    },
    approvalRuleCondition: {},
    approvalRuleStep: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        return ruleStepsStore.find((s) => s.id === where.id) ?? null;
      }),
    },
    approvalInstance: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: newId('inst'),
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        instancesStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          instancesStore.find(
            (i) =>
              (where.id ? i.id === where.id : true) &&
              (where.organizationId ? i.organizationId === where.organizationId : true),
          ) ?? null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const statusFilter = where.status as { in?: string[] } | string | undefined;
        return instancesStore.filter(
          (i) =>
            i.organizationId === where.organizationId &&
            (where.objectType ? i.objectType === where.objectType : true) &&
            (where.objectId ? i.objectId === where.objectId : true) &&
            (statusFilter
              ? typeof statusFilter === 'object' && Array.isArray(statusFilter.in)
                ? statusFilter.in.includes(i.status as string)
                : typeof statusFilter === 'string' && i.status === statusFilter
              : true),
        );
      }),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const statusFilter = where.status as { in?: string[] } | string | undefined;
        return instancesStore.filter(
          (i) =>
            (where.ruleId ? i.ruleId === where.ruleId : true) &&
            (statusFilter
              ? typeof statusFilter === 'object' && Array.isArray(statusFilter.in)
                ? statusFilter.in.includes(i.status as string)
                : typeof statusFilter === 'string' && i.status === statusFilter
              : true),
        ).length;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = instancesStore.find((i) => i.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const inst = instancesStore.find((i) => i.id === where.id);
        if (!inst) return null;
        const rule = rulesStore.find((r) => r.id === inst.ruleId);
        const steps = instanceStepsStore
          .filter((s) => s.instanceId === inst.id)
          .sort((a, b) => (a.stepOrder as number) - (b.stepOrder as number));
        return { ...inst, rule, steps };
      }),
    },
    approvalInstanceStep: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: newId('istep'),
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        instanceStepsStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const step = instanceStepsStore.find(
          (s) =>
            (where.id ? s.id === where.id : true) &&
            (where.organizationId ? s.organizationId === where.organizationId : true) &&
            (where.assignedTo ? s.assignedTo === where.assignedTo : true),
        );
        if (!step) return null;

        // Attach the instance + rule (to mimic Prisma include)
        const instance = instancesStore.find((i) => i.id === step.instanceId);
        const rule = instance ? rulesStore.find((r) => r.id === instance.ruleId) : null;
        return {
          ...step,
          instance: instance ? { ...instance, rule: rule ?? null } : null,
        };
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        // Support filtering by `instance: { status: 'pending' }`
        const instanceFilter = where.instance as { status?: string } | undefined;
        return instanceStepsStore
          .filter(
            (s) =>
              s.organizationId === where.organizationId &&
              (where.assignedTo ? s.assignedTo === where.assignedTo : true) &&
              (where.status ? s.status === where.status : true),
          )
          .filter((s) => {
            if (!instanceFilter?.status) return true;
            const inst = instancesStore.find((i) => i.id === s.instanceId);
            return inst?.status === instanceFilter.status;
          })
          .sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
      }),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const instanceFilter = where.instance as { status?: string } | undefined;
        return instanceStepsStore.filter(
          (s) =>
            s.organizationId === where.organizationId &&
            (where.assignedTo ? s.assignedTo === where.assignedTo : true) &&
            (where.status ? s.status === where.status : true),
        )
        .filter((s) => {
          if (!instanceFilter?.status) return true;
          const inst = instancesStore.find((i) => i.id === s.instanceId);
          return inst?.status === instanceFilter.status;
        })
        .length;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = instanceStepsStore.find((s) => s.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const statusFilter = where.status as { in?: string[] } | string | undefined;
        let count = 0;
        for (const s of instanceStepsStore) {
          if (
            (where.instanceId ? s.instanceId === where.instanceId : true) &&
            (statusFilter
              ? typeof statusFilter === 'object' && Array.isArray(statusFilter.in)
                ? statusFilter.in.includes(s.status as string)
                : typeof statusFilter === 'string' && s.status === statusFilter
              : true)
          ) {
            Object.assign(s, data);
            count++;
          }
        }
        return { count };
      }),
    },
    contract: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          contractsStore.find(
            (c) =>
              c.id === where.id &&
              c.organizationId === where.organizationId &&
              (where.deletedAt === null ? c.deletedAt === null : true),
          ) ?? null
        );
      }),
    },
    document: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          documentsStore.find(
            (d) =>
              d.id === where.id &&
              d.organizationId === where.organizationId &&
              (where.deletedAt === null ? d.deletedAt === null : true),
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
              u.organizationId === where.organizationId &&
              (where.deletedAt === null ? u.deletedAt === null : true),
          ) ?? null
        );
      }),
    },
    userRole: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const userId = where.userId as string;
        return userRolesStore
          .filter((ur) => ur.userId === userId)
          .map((ur) => ({
            ...ur,
            role: rolesStore.find((r) => r.id === ur.roleId),
          }));
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    approvalRule: txClient.approvalRule,
    approvalRuleCondition: txClient.approvalRuleCondition,
    approvalRuleStep: txClient.approvalRuleStep,
    approvalInstance: txClient.approvalInstance,
    approvalInstanceStep: txClient.approvalInstanceStep,
    contract: txClient.contract,
    document: txClient.document,
    user: txClient.user,
    userRole: txClient.userRole,
  };

  const tenantTx = {
    runInTenantContext: jest.fn(
      async <T>(orgId: string, fn: (tx: typeof txClient) => Promise<T>) => fn(txClient),
    ),
  };

  const audit = {
    append: jest.fn(async (input: Record<string, unknown>) => {
      const entry = { id: newId('audit'), ...input };
      auditStore.push(entry);
      return entry;
    }),
  };

  const seedUser = (id: string, orgId: string) => {
    usersStore.push({ id, organizationId: orgId, deletedAt: null });
  };
  const seedRole = (id: string, code: string) => {
    rolesStore.push({ id, code });
  };
  const seedUserRole = (userId: string, roleId: string) => {
    userRolesStore.push({ userId, roleId });
  };
  const seedContract = (id: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    contractsStore.push({
      id,
      organizationId: orgId,
      type: 'vendor_agreement',
      category: 'vendor',
      totalValue: '75000',
      totalCurrency: 'JOD',
      entityId: null,
      classification: 'internal',
      status: ContractStatus.draft,
      deletedAt: null,
      entity: null,
      ...overrides,
    });
  };
  const seedRule = (id: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id,
      organizationId: orgId,
      name: 'Test Rule',
      nameEn: null,
      description: null,
      objectType: 'contract',
      priority: 100,
      approvalType: 'sequential',
      isActive: true,
      isRequired: true,
      escalationMinutes: null,
      createdBy: 'user-1',
      deletedAt: null,
      deletedBy: null,
      rowVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      conditions: [],
      steps: [],
      ...overrides,
    };
    rulesStore.push(row);
    return row;
  };
  const seedRuleStep = (id: string, ruleId: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id,
      ruleId,
      organizationId: orgId,
      stepOrder: 1,
      name: 'Step 1',
      nameEn: null,
      approverRole: null,
      assignedUserId: null,
      canDelegate: false,
      canSkip: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    ruleStepsStore.push(row);
    return row;
  };
  const seedInstance = (id: string, orgId: string, ruleId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id,
      organizationId: orgId,
      ruleId,
      objectType: 'contract',
      objectId: 'ctr-1',
      status: 'pending',
      currentStepOrder: 1,
      submittedAt: new Date(),
      completedAt: null,
      submittedBy: 'user-1',
      submitNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    instancesStore.push(row);
    return row;
  };
  const seedInstanceStep = (id: string, instanceId: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id,
      instanceId,
      organizationId: orgId,
      ruleStepId: null,
      stepOrder: 1,
      name: 'Step 1',
      nameEn: null,
      assignedTo: 'user-2',
      originalAssignee: null,
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
      decisionNotes: null,
      delegatedTo: null,
      escalatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    instanceStepsStore.push(row);
    return row;
  };

  return {
    prisma,
    tenantTx,
    audit,
    txClient,
    stores: { rulesStore, conditionsStore, ruleStepsStore, instancesStore, instanceStepsStore, contractsStore, auditStore },
    seedUser,
    seedRole,
    seedUserRole,
    seedContract,
    seedRule,
    seedRuleStep,
    seedInstance,
    seedInstanceStep,
  };
}

const makeCtx = (overrides: Partial<TenantContext> = {}): TenantContext => ({
  organizationId: 'org-1',
  userId: 'user-1',
  roles: [],
  ...overrides,
});

describe('ApprovalsService', () => {
  let service: ApprovalsService;
  let mock: ReturnType<typeof makeMockInfra>;

  beforeEach(async () => {
    mock = makeMockInfra();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalsService,
        { provide: PrismaService, useValue: mock.prisma },
        { provide: TenantTransactionService, useValue: mock.tenantTx },
        { provide: AuditService, useValue: mock.audit },
      ],
    }).compile();
    service = module.get(ApprovalsService);
  });

  describe('createRule', () => {
    it('creates a rule with conditions and steps', async () => {
      mock.seedUser('user-2', 'org-1');
      const rule = await service.createRule(makeCtx(), {
        name: 'Vendor > 50k',
        objectType: 'contract',
        approvalType: 'sequential',
        conditions: [
          { field: 'type', operator: 'equals', value: 'vendor_agreement' },
          { field: 'total_value', operator: 'greater_than', value: '50000' },
        ],
        steps: [
          { stepOrder: 1, name: 'Legal Review', approverRole: 'lawyer' },
          { stepOrder: 2, name: 'CEO Sign-off', assignedUserId: 'user-2' },
        ],
      });
      expect(rule.name).toBe('Vendor > 50k');
      expect(rule.conditions).toHaveLength(2);
      expect(rule.steps).toHaveLength(2);
      expect(mock.audit.append).toHaveBeenCalledTimes(1);
    });

    it('throws NotFound when assignedUserId does not belong to org', async () => {
      await expect(
        service.createRule(makeCtx(), {
          name: 'X',
          objectType: 'contract',
          approvalType: 'sequential',
          conditions: [],
          steps: [{ stepOrder: 1, name: 'Step 1', assignedUserId: 'non-existent' }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest for duplicate step orders', async () => {
      mock.seedUser('user-2', 'org-1');
      await expect(
        service.createRule(makeCtx(), {
          name: 'X',
          objectType: 'contract',
          approvalType: 'sequential',
          conditions: [],
          steps: [
            { stepOrder: 1, name: 'Step 1', assignedUserId: 'user-2' },
            { stepOrder: 1, name: 'Step 2', assignedUserId: 'user-2' },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest for step order < 1', async () => {
      await expect(
        service.createRule(makeCtx(), {
          name: 'X',
          objectType: 'contract',
          approvalType: 'sequential',
          conditions: [],
          steps: [{ stepOrder: 0, name: 'Step 1' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitForApproval', () => {
    it('creates an instance + steps when a matching rule exists', async () => {
      mock.seedContract('ctr-1', 'org-1', { type: 'vendor_agreement', totalValue: '75000' });
      mock.seedUser('user-2', 'org-1');
      // Seed a matching rule
      const rule = mock.seedRule('rule-1', 'org-1', {
        objectType: 'contract',
        approvalType: 'sequential',
        priority: 100,
      });
      mock.stores.conditionsStore.push({
        id: 'cond-1',
        ruleId: 'rule-1',
        organizationId: 'org-1',
        field: 'type',
        operator: 'equals',
        value: 'vendor_agreement',
        createdAt: new Date(),
      });
      mock.seedRuleStep('rstep-1', 'rule-1', 'org-1', {
        stepOrder: 1,
        name: 'Legal Review',
        assignedUserId: 'user-2',
      });

      const result = await service.submitForApproval(makeCtx(), {
        objectType: 'contract',
        objectId: 'ctr-1',
      });
      expect(result.instance.status).toBe('pending');
      expect(result.instance.currentStepOrder).toBe(1);
      expect(result.steps).toHaveLength(1);
      expect(mock.audit.append).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequest when no matching rule exists', async () => {
      mock.seedContract('ctr-1', 'org-1', { type: 'nda', totalValue: '5000' });
      await expect(
        service.submitForApproval(makeCtx(), {
          objectType: 'contract',
          objectId: 'ctr-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws Conflict when an approval is already in progress', async () => {
      mock.seedContract('ctr-1', 'org-1', { type: 'vendor_agreement', totalValue: '75000' });
      mock.seedUser('user-2', 'org-1');
      mock.seedRule('rule-1', 'org-1', { objectType: 'contract', approvalType: 'sequential', priority: 100 });
      mock.seedRuleStep('rstep-1', 'rule-1', 'org-1', { stepOrder: 1, name: 'Review', assignedUserId: 'user-2' });
      // Seed an existing pending instance
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { objectId: 'ctr-1', status: 'pending' });

      await expect(
        service.submitForApproval(makeCtx(), { objectType: 'contract', objectId: 'ctr-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequest when contract is in an invalid status (approved)', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.approved });
      await expect(
        service.submitForApproval(makeCtx(), { objectType: 'contract', objectId: 'ctr-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest when the matched rule has no steps', async () => {
      mock.seedContract('ctr-1', 'org-1', { type: 'vendor_agreement' });
      mock.seedRule('rule-1', 'org-1', { objectType: 'contract', approvalType: 'sequential', priority: 100 });
      // No rule steps seeded

      await expect(
        service.submitForApproval(makeCtx(), { objectType: 'contract', objectId: 'ctr-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest when rule step has no assignable user', async () => {
      mock.seedContract('ctr-1', 'org-1', { type: 'vendor_agreement' });
      mock.seedRule('rule-1', 'org-1', { objectType: 'contract', approvalType: 'sequential', priority: 100 });
      mock.seedRuleStep('rstep-1', 'rule-1', 'org-1', {
        stepOrder: 1,
        name: 'Review',
        approverRole: 'lawyer', // No user with this role seeded
        assignedUserId: null,
      });

      await expect(
        service.submitForApproval(makeCtx(), { objectType: 'contract', objectId: 'ctr-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('selects the first matching rule (by priority) when multiple match', async () => {
      mock.seedContract('ctr-1', 'org-1', { type: 'vendor_agreement', totalValue: '75000' });
      mock.seedUser('user-2', 'org-1');
      mock.seedUser('user-3', 'org-1');

      // Rule A: priority 200 (higher number = lower priority)
      mock.seedRule('rule-A', 'org-1', {
        name: 'Rule A', objectType: 'contract', approvalType: 'sequential', priority: 200,
      });
      mock.stores.conditionsStore.push({
        id: 'cond-A', ruleId: 'rule-A', organizationId: 'org-1',
        field: 'type', operator: 'equals', value: 'vendor_agreement', createdAt: new Date(),
      });
      mock.seedRuleStep('rstep-A', 'rule-A', 'org-1', { stepOrder: 1, name: 'Review A', assignedUserId: 'user-2' });

      // Rule B: priority 50 (lower number = higher priority)
      mock.seedRule('rule-B', 'org-1', {
        name: 'Rule B', objectType: 'contract', approvalType: 'sequential', priority: 50,
      });
      mock.stores.conditionsStore.push({
        id: 'cond-B', ruleId: 'rule-B', organizationId: 'org-1',
        field: 'type', operator: 'equals', value: 'vendor_agreement', createdAt: new Date(),
      });
      mock.seedRuleStep('rstep-B', 'rule-B', 'org-1', { stepOrder: 1, name: 'Review B', assignedUserId: 'user-3' });

      const result = await service.submitForApproval(makeCtx(), {
        objectType: 'contract',
        objectId: 'ctr-1',
      });
      expect(result.rule.id).toBe('rule-B'); // Lower priority number wins
    });
  });

  describe('decideStep', () => {
    it('approves a step + advances currentStepOrder in sequential flow', async () => {
      mock.seedRule('rule-1', 'org-1', { approvalType: 'sequential' });
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { currentStepOrder: 1 });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        stepOrder: 1, assignedTo: 'user-2', status: 'pending',
      });
      mock.seedInstanceStep('istep-2', 'inst-1', 'org-1', {
        stepOrder: 2, assignedTo: 'user-3', status: 'pending',
      });

      const result = await service.decideStep(
        { ...makeCtx(), userId: 'user-2' },
        'istep-1',
        'approved',
      );
      expect(result.step.status).toBe('approved');
      expect(result.instanceStatus).toBe('pending'); // still pending — step 2 remains

      // Verify currentStepOrder advanced to 2
      const inst = mock.stores.instancesStore[0]!;
      expect(inst.currentStepOrder).toBe(2);
    });

    it('approves final step → instance status = approved', async () => {
      mock.seedRule('rule-1', 'org-1', { approvalType: 'sequential' });
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { currentStepOrder: 1 });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        stepOrder: 1, assignedTo: 'user-2', status: 'pending',
      });

      const result = await service.decideStep(
        { ...makeCtx(), userId: 'user-2' },
        'istep-1',
        'approved',
      );
      expect(result.instanceStatus).toBe('approved');
      const inst = mock.stores.instancesStore[0]!;
      expect(inst.status).toBe('approved');
      expect(inst.completedAt).toBeTruthy();
    });

    it('rejects a step → instance status = rejected', async () => {
      mock.seedRule('rule-1', 'org-1', { approvalType: 'sequential' });
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { currentStepOrder: 1 });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        stepOrder: 1, assignedTo: 'user-2', status: 'pending',
      });

      const result = await service.decideStep(
        { ...makeCtx(), userId: 'user-2' },
        'istep-1',
        'rejected',
        'Terms not acceptable',
      );
      expect(result.instanceStatus).toBe('rejected');
    });

    it('changes_requested → instance status = changes_requested', async () => {
      mock.seedRule('rule-1', 'org-1', { approvalType: 'sequential' });
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { currentStepOrder: 1 });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        stepOrder: 1, assignedTo: 'user-2', status: 'pending',
      });

      const result = await service.decideStep(
        { ...makeCtx(), userId: 'user-2' },
        'istep-1',
        'changes_requested',
        'Please revise clause 3',
      );
      expect(result.instanceStatus).toBe('changes_requested');
    });

    it('throws Forbidden when non-assigned user tries to decide', async () => {
      mock.seedRule('rule-1', 'org-1', { approvalType: 'sequential' });
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { currentStepOrder: 1 });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        stepOrder: 1, assignedTo: 'user-2', status: 'pending',
      });

      await expect(
        service.decideStep(makeCtx(), 'istep-1', 'approved'), // user-1, not user-2
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequest when deciding a step that is not the current step (sequential)', async () => {
      mock.seedRule('rule-1', 'org-1', { approvalType: 'sequential' });
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { currentStepOrder: 1 });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        stepOrder: 1, assignedTo: 'user-2', status: 'pending',
      });
      mock.seedInstanceStep('istep-2', 'inst-1', 'org-1', {
        stepOrder: 2, assignedTo: 'user-3', status: 'pending',
      });

      // Trying to decide step 2 while current is step 1
      await expect(
        service.decideStep(
          { ...makeCtx(), userId: 'user-3' },
          'istep-2',
          'approved',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest when step is already decided', async () => {
      mock.seedRule('rule-1', 'org-1', { approvalType: 'sequential' });
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { currentStepOrder: 2 });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        stepOrder: 1, assignedTo: 'user-2', status: 'approved',
      });

      await expect(
        service.decideStep(
          { ...makeCtx(), userId: 'user-2' },
          'istep-1',
          'approved',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('parallel rule: all steps must approve → instance approved', async () => {
      mock.seedRule('rule-1', 'org-1', { approvalType: 'parallel' });
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { currentStepOrder: null });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        stepOrder: 1, assignedTo: 'user-2', status: 'pending',
      });
      mock.seedInstanceStep('istep-2', 'inst-1', 'org-1', {
        stepOrder: 2, assignedTo: 'user-3', status: 'pending',
      });

      // Approve first step
      const r1 = await service.decideStep(
        { ...makeCtx(), userId: 'user-2' },
        'istep-1',
        'approved',
      );
      expect(r1.instanceStatus).toBe('pending');

      // Approve second step → instance should be approved
      const r2 = await service.decideStep(
        { ...makeCtx(), userId: 'user-3' },
        'istep-2',
        'approved',
      );
      expect(r2.instanceStatus).toBe('approved');
    });
  });

  describe('delegateStep', () => {
    it('delegates a step to another user', async () => {
      mock.seedRule('rule-1', 'org-1', { approvalType: 'sequential' });
      mock.seedRuleStep('rstep-1', 'rule-1', 'org-1', { canDelegate: true });
      mock.seedInstance('inst-1', 'org-1', 'rule-1');
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        ruleStepId: 'rstep-1',
        stepOrder: 1,
        assignedTo: 'user-2',
        status: 'pending',
      });
      mock.seedUser('user-3', 'org-1');

      const updated = await service.delegateStep(
        { ...makeCtx(), userId: 'user-2' },
        'istep-1',
        'user-3',
        'On vacation, please handle',
      );
      expect(updated.assignedTo).toBe('user-3');
      expect(updated.originalAssignee).toBe('user-2');
      expect(updated.delegatedTo).toBe('user-3');
    });

    it('throws BadRequest when step does not allow delegation', async () => {
      mock.seedRule('rule-1', 'org-1', { approvalType: 'sequential' });
      mock.seedRuleStep('rstep-1', 'rule-1', 'org-1', { canDelegate: false });
      mock.seedInstance('inst-1', 'org-1', 'rule-1');
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        ruleStepId: 'rstep-1',
        assignedTo: 'user-2',
        status: 'pending',
      });
      mock.seedUser('user-3', 'org-1');

      await expect(
        service.delegateStep({ ...makeCtx(), userId: 'user-2' }, 'istep-1', 'user-3'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws Forbidden when non-assigned user tries to delegate', async () => {
      mock.seedRule('rule-1', 'org-1', { approvalType: 'sequential' });
      mock.seedRuleStep('rstep-1', 'rule-1', 'org-1', { canDelegate: true });
      mock.seedInstance('inst-1', 'org-1', 'rule-1');
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        ruleStepId: 'rstep-1',
        assignedTo: 'user-2',
        status: 'pending',
      });
      mock.seedUser('user-3', 'org-1');

      await expect(
        service.delegateStep(makeCtx(), 'istep-1', 'user-3'), // user-1, not user-2
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('skipStep', () => {
    it('skips a skippable step + advances sequential flow', async () => {
      mock.seedRule('rule-1', 'org-1', { approvalType: 'sequential' });
      mock.seedRuleStep('rstep-1', 'rule-1', 'org-1', { canSkip: true });
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { currentStepOrder: 1 });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        ruleStepId: 'rstep-1',
        stepOrder: 1,
        assignedTo: 'user-2',
        status: 'pending',
      });
      mock.seedInstanceStep('istep-2', 'inst-1', 'org-1', {
        stepOrder: 2,
        assignedTo: 'user-3',
        status: 'pending',
      });

      const result = await service.skipStep(makeCtx(), 'istep-1', 'Not required');
      expect(result.step.status).toBe('skipped');
      expect(result.instanceStatus).toBe('pending');

      // currentStepOrder should advance to 2
      const inst = mock.stores.instancesStore[0]!;
      expect(inst.currentStepOrder).toBe(2);
    });

    it('throws BadRequest when step does not allow skipping', async () => {
      mock.seedRule('rule-1', 'org-1', { approvalType: 'sequential' });
      mock.seedRuleStep('rstep-1', 'rule-1', 'org-1', { canSkip: false });
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { currentStepOrder: 1 });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        ruleStepId: 'rstep-1',
        assignedTo: 'user-2',
        status: 'pending',
      });

      await expect(
        service.skipStep(makeCtx(), 'istep-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelInstance', () => {
    it('submitter can cancel their own pending instance', async () => {
      mock.seedRule('rule-1', 'org-1');
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { submittedBy: 'user-1', status: 'pending' });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', { status: 'pending' });

      const result = await service.cancelInstance(makeCtx(), 'inst-1', 'No longer needed');
      expect(result.success).toBe(true);
      expect(mock.stores.instancesStore[0]!.status).toBe('cancelled');
    });

    it('throws Forbidden when non-submitter (and non-admin) tries to cancel', async () => {
      mock.seedRule('rule-1', 'org-1');
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { submittedBy: 'user-2', status: 'pending' });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', { status: 'pending' });

      await expect(
        service.cancelInstance(makeCtx(), 'inst-1'), // user-1, not submitter
      ).rejects.toThrow(ForbiddenException);
    });

    it('legal_admin can cancel any instance', async () => {
      mock.seedRole('role-1', 'legal_admin');
      mock.seedUserRole('user-1', 'role-1');
      mock.seedRule('rule-1', 'org-1');
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { submittedBy: 'user-2', status: 'pending' });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', { status: 'pending' });

      const result = await service.cancelInstance(makeCtx(), 'inst-1');
      expect(result.success).toBe(true);
    });

    it('throws BadRequest when instance is not pending', async () => {
      mock.seedRule('rule-1', 'org-1');
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { submittedBy: 'user-1', status: 'approved' });

      await expect(
        service.cancelInstance(makeCtx(), 'inst-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('triggerReapproval', () => {
    it('cancels pending instances when object is modified', async () => {
      mock.seedRule('rule-1', 'org-1');
      mock.seedInstance('inst-1', 'org-1', 'rule-1', {
        objectType: 'contract', objectId: 'ctr-1', status: 'pending',
      });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', { status: 'pending' });

      const result = await service.triggerReapproval(
        makeCtx(),
        'contract',
        'ctr-1',
        'Contract value changed',
      );
      expect(result.affectedInstances).toBe(1);
      expect(mock.stores.instancesStore[0]!.status).toBe('cancelled');
    });

    it('marks approved instances as changes_requested when object is modified', async () => {
      mock.seedRule('rule-1', 'org-1');
      mock.seedInstance('inst-1', 'org-1', 'rule-1', {
        objectType: 'contract', objectId: 'ctr-1', status: 'approved',
      });

      const result = await service.triggerReapproval(
        makeCtx(),
        'contract',
        'ctr-1',
        'Contract value changed',
      );
      expect(result.affectedInstances).toBe(1);
      expect(mock.stores.instancesStore[0]!.status).toBe('changes_requested');
    });

    it('does not affect cancelled/rejected/expired instances', async () => {
      mock.seedRule('rule-1', 'org-1');
      mock.seedInstance('inst-1', 'org-1', 'rule-1', {
        objectType: 'contract', objectId: 'ctr-1', status: 'cancelled',
      });
      mock.seedInstance('inst-2', 'org-1', 'rule-1', {
        objectType: 'contract', objectId: 'ctr-1', status: 'rejected',
      });

      const result = await service.triggerReapproval(
        makeCtx(),
        'contract',
        'ctr-1',
        'Modified',
      );
      expect(result.affectedInstances).toBe(0);
    });
  });

  describe('listMyPendingSteps', () => {
    it('returns only steps assigned to current user that are pending', async () => {
      mock.seedRule('rule-1', 'org-1');
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { status: 'pending' });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        assignedTo: 'user-1', status: 'pending',
      });
      mock.seedInstanceStep('istep-2', 'inst-1', 'org-1', {
        assignedTo: 'user-2', status: 'pending',
      });
      mock.seedInstanceStep('istep-3', 'inst-1', 'org-1', {
        assignedTo: 'user-1', status: 'approved',
      });

      const result = await service.listMyPendingSteps(makeCtx(), { page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe('istep-1');
    });

    it('excludes steps from instances that are no longer pending', async () => {
      mock.seedRule('rule-1', 'org-1');
      mock.seedInstance('inst-1', 'org-1', 'rule-1', { status: 'approved' });
      mock.seedInstanceStep('istep-1', 'inst-1', 'org-1', {
        assignedTo: 'user-1', status: 'pending', // step pending but instance approved
      });

      const result = await service.listMyPendingSteps(makeCtx(), { page: 1, limit: 10 });
      expect(result.data).toHaveLength(0);
    });
  });
});
