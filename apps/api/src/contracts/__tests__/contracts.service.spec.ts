import { Test, TestingModule } from '@nestjs/testing';
import { ContractsService } from '../contracts.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { AuditService } from '../../audit/audit.service';
import { ContractStatus, SignatureStatus } from '@glo/shared';
import type { TenantContext } from '@glo/shared';
import { Prisma } from '@prisma/client';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

function makeMockInfra() {
  const contractsStore: Array<Record<string, unknown>> = [];
  const partiesStore: Array<Record<string, unknown>> = [];
  const valuesStore: Array<Record<string, unknown>> = [];
  const signaturesStore: Array<Record<string, unknown>> = [];
  const entitiesStore: Array<Record<string, unknown>> = [];
  const mattersStore: Array<Record<string, unknown>> = [];
  const usersStore: Array<Record<string, unknown>> = [];
  const auditStore: Array<Record<string, unknown>> = [];

  const txClient = {
    contract: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `ctr-${contractsStore.length + 1}`,
          ...data,
          rowVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        contractsStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          contractsStore.find(
            (c) =>
              (where.id ? c.id === where.id : true) &&
              (where.organizationId ? c.organizationId === where.organizationId : true) &&
              (where.deletedAt === null ? c.deletedAt === null : true),
          ) ?? null
        );
      }),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const prefix = (where.contractNumber as { startsWith?: string } | undefined)?.startsWith;
        return contractsStore.filter(
          (c) =>
            c.organizationId === where.organizationId &&
            (prefix ? String(c.contractNumber).startsWith(prefix) : true),
        ).length;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return contractsStore.filter(
          (c) =>
            c.organizationId === where.organizationId &&
            (where.deletedAt === null ? c.deletedAt === null : true) &&
            (where.status ? c.status === where.status : true),
        );
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = contractsStore.find((c) => c.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { rowVersion: (row.rowVersion as number) + 1 });
        return row;
      }),
    },
    contractParty: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `party-${partiesStore.length + 1}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        partiesStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          partiesStore.find(
            (p) =>
              (where.id ? p.id === where.id : true) &&
              (where.contractId ? p.contractId === where.contractId : true) &&
              (where.organizationId ? p.organizationId === where.organizationId : true),
          ) ?? null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return partiesStore.filter((p) => p.contractId === where.contractId);
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = partiesStore.find((p) => p.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const idx = partiesStore.findIndex((p) => p.id === where.id);
        if (idx >= 0) return partiesStore.splice(idx, 1)[0];
        throw new Error('not found');
      }),
    },
    contractValue: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `val-${valuesStore.length + 1}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        valuesStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          valuesStore.find(
            (v) =>
              (where.id ? v.id === where.id : true) &&
              (where.contractId ? v.contractId === where.contractId : true) &&
              (where.organizationId ? v.organizationId === where.organizationId : true),
          ) ?? null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return valuesStore.filter((v) => v.contractId === where.contractId);
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const idx = valuesStore.findIndex((v) => v.id === where.id);
        if (idx >= 0) return valuesStore.splice(idx, 1)[0];
        throw new Error('not found');
      }),
    },
    contractSignature: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `sig-${signaturesStore.length + 1}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        signaturesStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          signaturesStore.find(
            (s) =>
              (where.id ? s.id === where.id : true) &&
              (where.contractId ? s.contractId === where.contractId : true) &&
              (where.organizationId ? s.organizationId === where.organizationId : true),
          ) ?? null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return signaturesStore.filter((s) => s.contractId === where.contractId);
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = signaturesStore.find((s) => s.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
    },
    entity: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          entitiesStore.find(
            (e) =>
              e.id === where.id &&
              e.organizationId === where.organizationId &&
              (where.deletedAt === null ? e.deletedAt === null : true),
          ) ?? null
        );
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
    $transaction: jest.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    contract: txClient.contract,
    contractParty: txClient.contractParty,
    contractValue: txClient.contractValue,
    contractSignature: txClient.contractSignature,
    entity: txClient.entity,
    matter: txClient.matter,
    user: txClient.user,
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
  const seedMatter = (id: string, orgId: string) => {
    mattersStore.push({ id, organizationId: orgId, deletedAt: null, matterNumber: 'MTR-X' });
  };
  const seedUser = (id: string, orgId: string) => {
    usersStore.push({ id, organizationId: orgId, deletedAt: null });
  };
  const seedContract = (id: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id,
      organizationId: orgId,
      entityId: null,
      matterId: null,
      contractNumber: `CTR-2026-${String(contractsStore.length + 1).padStart(4, '0')}`,
      title: 'Test Contract',
      titleEn: null,
      description: null,
      type: null,
      category: null,
      status: ContractStatus.draft,
      priority: 'medium',
      effectiveDate: null,
      expiryDate: null,
      counterpartyName: null,
      counterpartyNameEn: null,
      totalValue: null,
      totalCurrency: null,
      assignedTo: null,
      createdBy: 'user-1',
      classification: 'internal',
      deletedAt: null,
      deletedBy: null,
      rowVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    contractsStore.push(row);
    return row;
  };
  const seedSignature = (id: string, contractId: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id,
      contractId,
      organizationId: orgId,
      signerName: 'Test Signer',
      signerNameEn: null,
      signerTitle: null,
      signerUserId: null,
      sequence: 1,
      status: SignatureStatus.pending,
      signedAt: null,
      signedDocumentUrl: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    signaturesStore.push(row);
    return row;
  };

  return {
    prisma,
    tenantTx,
    audit,
    txClient,
    stores: { contractsStore, partiesStore, valuesStore, signaturesStore, auditStore },
    seedEntity,
    seedMatter,
    seedUser,
    seedContract,
    seedSignature,
  };
}

const makeCtx = (overrides: Partial<TenantContext> = {}): TenantContext => ({
  organizationId: 'org-1',
  userId: 'user-1',
  roles: [],
  ...overrides,
});

describe('ContractsService', () => {
  let service: ContractsService;
  let mock: ReturnType<typeof makeMockInfra>;

  beforeEach(async () => {
    mock = makeMockInfra();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: mock.prisma },
        { provide: TenantTransactionService, useValue: mock.tenantTx },
        { provide: AuditService, useValue: mock.audit },
      ],
    }).compile();
    service = module.get(ContractsService);
  });

  describe('create', () => {
    it('creates a draft contract with a generated contract number', async () => {
      const c = await service.create(makeCtx(), { title: 'NDA with Acme' });
      expect(c.status).toBe(ContractStatus.draft);
      expect(c.contractNumber).toMatch(/^CTR-\d{4}-\d{4}$/);
      expect(mock.audit.append).toHaveBeenCalledTimes(1);
    });

    it('throws NotFound when entityId does not belong to the org', async () => {
      await expect(
        service.create(makeCtx(), { title: 'X', entityId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when matterId does not belong to the org', async () => {
      await expect(
        service.create(makeCtx(), { title: 'X', matterId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest when effectiveDate is after expiryDate', async () => {
      await expect(
        service.create(makeCtx(), {
          title: 'X',
          effectiveDate: '2026-12-01',
          expiryDate: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts valid entityId and matterId', async () => {
      mock.seedEntity('ent-1', 'org-1');
      mock.seedMatter('mtr-1', 'org-1');
      const c = await service.create(makeCtx(), {
        title: 'X',
        entityId: 'ent-1',
        matterId: 'mtr-1',
      });
      expect(c.entityId).toBe('ent-1');
      expect(c.matterId).toBe('mtr-1');
    });
  });

  describe('transition', () => {
    it('transitions draft → under_review', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.draft });
      const updated = await service.transition(makeCtx(), 'ctr-1', ContractStatus.under_review);
      expect(updated.status).toBe(ContractStatus.under_review);
    });

    it('transitions under_review → pending_approval', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.under_review });
      const updated = await service.transition(makeCtx(), 'ctr-1', ContractStatus.pending_approval);
      expect(updated.status).toBe(ContractStatus.pending_approval);
    });

    it('transitions pending_approval → approved', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.pending_approval });
      const updated = await service.transition(makeCtx(), 'ctr-1', ContractStatus.approved);
      expect(updated.status).toBe(ContractStatus.approved);
    });

    it('transitions approved → pending_signature', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.approved });
      const updated = await service.transition(makeCtx(), 'ctr-1', ContractStatus.pending_signature);
      expect(updated.status).toBe(ContractStatus.pending_signature);
    });

    it('transitions pending_signature → signed', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.pending_signature });
      const updated = await service.transition(makeCtx(), 'ctr-1', ContractStatus.signed);
      expect(updated.status).toBe(ContractStatus.signed);
    });

    it('transitions signed → active', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.signed });
      const updated = await service.transition(makeCtx(), 'ctr-1', ContractStatus.active);
      expect(updated.status).toBe(ContractStatus.active);
    });

    it('sets effectiveDate to now when transitioning to active without one', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.signed, effectiveDate: null });
      const updated = await service.transition(makeCtx(), 'ctr-1', ContractStatus.active);
      expect(updated.effectiveDate).toBeTruthy();
    });

    it('transitions active → expired', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.active });
      const updated = await service.transition(makeCtx(), 'ctr-1', ContractStatus.expired);
      expect(updated.status).toBe(ContractStatus.expired);
    });

    it('transitions expired → draft_new_version (renewal)', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.expired });
      const updated = await service.transition(makeCtx(), 'ctr-1', ContractStatus.draft_new_version);
      expect(updated.status).toBe(ContractStatus.draft_new_version);
    });

    it('throws BadRequest for invalid transition (draft → approved)', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.draft });
      await expect(
        service.transition(makeCtx(), 'ctr-1', ContractStatus.approved),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest for invalid transition (active → draft)', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.active });
      await expect(
        service.transition(makeCtx(), 'ctr-1', ContractStatus.draft),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound for contract from a different org (RLS)', async () => {
      mock.seedContract('ctr-1', 'org-OTHER', { status: ContractStatus.draft });
      await expect(
        service.transition(makeCtx(), 'ctr-1', ContractStatus.under_review),
      ).rejects.toThrow(NotFoundException);
    });

    it('is idempotent when transitioning to the same status', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.draft });
      const result = await service.transition(makeCtx(), 'ctr-1', ContractStatus.draft);
      expect(result.status).toBe(ContractStatus.draft);
      expect(mock.audit.append).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates a draft contract', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.draft });
      const updated = await service.update(makeCtx(), 'ctr-1', { title: 'Updated' });
      expect(updated.title).toBe('Updated');
    });

    it('throws Conflict when rowVersion mismatch', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.draft, rowVersion: 5 });
      await expect(
        service.update(makeCtx(), 'ctr-1', { title: 'X', rowVersion: 3 }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequest when updating an active contract', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.active });
      await expect(
        service.update(makeCtx(), 'ctr-1', { title: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('softDelete', () => {
    it('deletes a draft contract', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.draft });
      const result = await service.softDelete(makeCtx(), 'ctr-1');
      expect(result.success).toBe(true);
    });

    it('throws BadRequest when deleting an active contract', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.active });
      await expect(
        service.softDelete(makeCtx(), 'ctr-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('addParty', () => {
    it('adds an external party to a draft contract', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.draft });
      const party = await service.addParty(makeCtx(), 'ctr-1', {
        partyType: 'external',
        name: 'Acme Corp',
        nameEn: 'Acme Corp',
        role: 'counterparty',
      });
      expect(party.name).toBe('Acme Corp');
      expect(party.partyType).toBe('external');
    });

    it('adds an internal party with a valid entityId', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.draft });
      mock.seedEntity('ent-1', 'org-1');
      const party = await service.addParty(makeCtx(), 'ctr-1', {
        partyType: 'internal',
        entityId: 'ent-1',
        name: 'Our Company',
        role: 'buyer',
      });
      expect(party.entityId).toBe('ent-1');
    });

    it('throws BadRequest when adding a party to an active contract', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.active });
      await expect(
        service.addParty(makeCtx(), 'ctr-1', {
          partyType: 'external',
          name: 'X',
          role: 'counterparty',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('addValue', () => {
    it('adds a base value and updates contract totalValue', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.draft });
      const value = await service.addValue(makeCtx(), 'ctr-1', {
        valueType: 'base',
        amount: 50000,
        currency: 'JOD',
      });
      expect(value.amount.toString()).toBe('50000');
      // totalValue should be updated on the contract
      const contract = mock.stores.contractsStore[0]!;
      expect(contract.totalValue?.toString()).toBe('50000');
    });

    it('throws BadRequest when adding a value to an active contract', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.active });
      await expect(
        service.addValue(makeCtx(), 'ctr-1', {
          valueType: 'base',
          amount: 100,
          currency: 'JOD',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('signatures', () => {
    it('adds a signature to an approved contract', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.approved });
      const sig = await service.addSignature(makeCtx(), 'ctr-1', {
        signerName: 'John Doe',
        signerTitle: 'CEO',
        sequence: 1,
      });
      expect(sig.signerName).toBe('John Doe');
      expect(sig.status).toBe(SignatureStatus.pending);
    });

    it('records a signature as signed with a document URL', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.pending_signature });
      mock.seedSignature('sig-1', 'ctr-1', 'org-1', { status: SignatureStatus.pending });
      const result = await service.recordSignature(makeCtx(), 'ctr-1', 'sig-1', {
        status: SignatureStatus.signed,
        signedDocumentUrl: 'https://storage.example.com/signed-ctr-1.pdf',
      });
      expect(result.signature.status).toBe(SignatureStatus.signed);
      expect(result.signature.signedAt).toBeTruthy();
      expect(result.signature.signedDocumentUrl).toBe('https://storage.example.com/signed-ctr-1.pdf');
    });

    it('throws BadRequest when recording a signature that is already signed', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.pending_signature });
      mock.seedSignature('sig-1', 'ctr-1', 'org-1', { status: SignatureStatus.signed });
      await expect(
        service.recordSignature(makeCtx(), 'ctr-1', 'sig-1', {
          status: SignatureStatus.signed,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns allSignaturesComplete=true when all signers have signed', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.pending_signature });
      mock.seedSignature('sig-1', 'ctr-1', 'org-1', { status: SignatureStatus.signed });
      mock.seedSignature('sig-2', 'ctr-1', 'org-1', { status: SignatureStatus.pending, sequence: 2 });
      const result = await service.recordSignature(makeCtx(), 'ctr-1', 'sig-2', {
        status: SignatureStatus.signed,
      });
      expect(result.allSignaturesComplete).toBe(true);
    });

    it('returns allSignaturesComplete=false when not all signers have signed', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.pending_signature });
      mock.seedSignature('sig-1', 'ctr-1', 'org-1', { status: SignatureStatus.pending });
      mock.seedSignature('sig-2', 'ctr-1', 'org-1', { status: SignatureStatus.pending, sequence: 2 });
      const result = await service.recordSignature(makeCtx(), 'ctr-1', 'sig-1', {
        status: SignatureStatus.signed,
      });
      expect(result.allSignaturesComplete).toBe(false);
    });

    it('throws BadRequest when adding a signature to an active contract', async () => {
      mock.seedContract('ctr-1', 'org-1', { status: ContractStatus.active });
      await expect(
        service.addSignature(makeCtx(), 'ctr-1', { signerName: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('returns the contract with includes', async () => {
      mock.seedContract('ctr-1', 'org-1');
      const c = await service.findOne(makeCtx(), 'ctr-1');
      expect(c.id).toBe('ctr-1');
    });

    it('throws NotFound for non-existent contract', async () => {
      await expect(
        service.findOne(makeCtx(), 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound for contract from a different org (RLS)', async () => {
      mock.seedContract('ctr-1', 'org-OTHER');
      await expect(
        service.findOne(makeCtx(), 'ctr-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns paginated contracts for the current tenant only', async () => {
      mock.seedContract('ctr-1', 'org-1');
      mock.seedContract('ctr-2', 'org-1');
      mock.seedContract('ctr-3', 'org-OTHER');
      const result = await service.list(makeCtx(), { page: 1, limit: 10 });
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });
  });
});
