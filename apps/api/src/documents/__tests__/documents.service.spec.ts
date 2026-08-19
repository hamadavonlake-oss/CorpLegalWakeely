import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from '../documents.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { AuditService } from '../../audit/audit.service';
import { STORAGE_SERVICE } from '../../storage/storage.interface';
import { DocumentStatus, VirusScanStatus } from '@glo/shared';
import type { TenantContext } from '@glo/shared';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

function makeMockStorage() {
  const store = new Map<string, { buffer: Buffer; mimeType: string }>();
  return {
    upload: jest.fn(async (key: string, buffer: Buffer, mimeType: string) => {
      const { createHash } = require('node:crypto');
      const contentHash = createHash('sha256').update(buffer).digest('hex');
      store.set(key, { buffer, mimeType });
      return {
        storageKey: key,
        sizeBytes: buffer.length,
        contentHash,
        mimeType,
      };
    }),
    download: jest.fn(async (key: string) => {
      const obj = store.get(key);
      return obj ? obj.buffer : null;
    }),
    getSignedDownloadUrl: jest.fn(async (key: string) => `https://mock-storage.local/${key}?signed=true`),
    getSignedUploadUrl: jest.fn(async () => 'https://mock-storage.local/upload?signed=true'),
    delete: jest.fn(async (key: string) => store.delete(key)),
    exists: jest.fn(async (key: string) => store.has(key)),
    healthCheck: jest.fn(async () => ({ up: true, latencyMs: 5 })),
  };
}

function makeMockInfra() {
  const documentsStore: Array<Record<string, unknown>> = [];
  const versionsStore: Array<Record<string, unknown>> = [];
  const contractsStore: Array<Record<string, unknown>> = [];
  const mattersStore: Array<Record<string, unknown>> = [];
  const requestsStore: Array<Record<string, unknown>> = [];
  const linksStore: Array<Record<string, unknown>> = [];
  const auditStore: Array<Record<string, unknown>> = [];

  const txClient = {
    document: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `doc-${documentsStore.length + 1}`,
          ...data,
          currentVersion: 1,
          rowVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        documentsStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          documentsStore.find(
            (d) =>
              (where.id ? d.id === where.id : true) &&
              (where.organizationId ? d.organizationId === where.organizationId : true) &&
              (where.deletedAt === null ? d.deletedAt === null : true),
          ) ?? null
        );
      }),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const prefix = (where.documentNumber as { startsWith?: string } | undefined)?.startsWith;
        return documentsStore.filter(
          (d) =>
            d.organizationId === where.organizationId &&
            (prefix ? String(d.documentNumber).startsWith(prefix) : true),
        ).length;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return documentsStore.filter(
          (d) =>
            d.organizationId === where.organizationId &&
            (where.deletedAt === null ? d.deletedAt === null : true) &&
            (where.status ? d.status === where.status : true),
        );
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = documentsStore.find((d) => d.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { rowVersion: (row.rowVersion as number) + 1 });
        return row;
      }),
    },
    documentVersion: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `ver-${versionsStore.length + 1}`,
          ...data,
          createdAt: new Date(),
        };
        versionsStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          versionsStore.find(
            (v) =>
              (where.documentId ? v.documentId === where.documentId : true) &&
              (where.organizationId ? v.organizationId === where.organizationId : true) &&
              (where.versionNumber ? v.versionNumber === where.versionNumber : true),
          ) ?? null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return versionsStore
          .filter((v) => v.documentId === where.documentId)
          .sort((a, b) => (b.versionNumber as number) - (a.versionNumber as number));
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    contract: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          contractsStore.find(
            (c) =>
              c.id === where.id &&
              c.organizationId === where.organizationId,
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
              m.organizationId === where.organizationId,
          ) ?? null
        );
      }),
    },
    legalRequest: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          requestsStore.find(
            (r) =>
              r.id === where.id &&
              r.organizationId === where.organizationId,
          ) ?? null
        );
      }),
    },
    contractDocumentLink: {
      findUnique: jest.fn(async ({ where }: { where: { contractId_documentId_linkType: { contractId: string; documentId: string; linkType: string } } }) => {
        return (
          linksStore.find(
            (l) =>
              l.contractId === where.contractId_documentId_linkType.contractId &&
              l.documentId === where.contractId_documentId_linkType.documentId &&
              l.linkType === where.contractId_documentId_linkType.linkType,
          ) ?? null
        );
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `link-${linksStore.length + 1}`, ...data, createdAt: new Date() };
        linksStore.push(row);
        return row;
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const idx = linksStore.findIndex((l) => l.id === where.id);
        if (idx >= 0) return linksStore.splice(idx, 1)[0];
        throw new Error('not found');
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    document: txClient.document,
    documentVersion: txClient.documentVersion,
    contract: txClient.contract,
    matter: txClient.matter,
    legalRequest: txClient.legalRequest,
    contractDocumentLink: txClient.contractDocumentLink,
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

  const seedContract = (id: string, orgId: string) => {
    contractsStore.push({ id, organizationId: orgId, deletedAt: null, contractNumber: 'CTR-1' });
  };
  const seedMatter = (id: string, orgId: string) => {
    mattersStore.push({ id, organizationId: orgId, deletedAt: null });
  };
  const seedRequest = (id: string, orgId: string) => {
    requestsStore.push({ id, organizationId: orgId, deletedAt: null });
  };
  const seedDocument = (id: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id,
      organizationId: orgId,
      contractId: null,
      matterId: null,
      legalRequestId: null,
      documentNumber: `DOC-2026-${String(documentsStore.length + 1).padStart(4, '0')}`,
      title: 'Test Document',
      titleEn: null,
      description: null,
      type: 'contract_draft',
      status: DocumentStatus.draft,
      classification: 'internal',
      mimeType: null,
      sizeBytes: null,
      contentHash: null,
      virusScanStatus: 'pending',
      currentVersion: 1,
      uploadedBy: 'user-1',
      approvedBy: null,
      approvedAt: null,
      legalHold: false,
      retentionUntil: null,
      deletedAt: null,
      deletedBy: null,
      rowVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    documentsStore.push(row);
    return row;
  };

  return {
    prisma,
    tenantTx,
    audit,
    txClient,
    stores: { documentsStore, versionsStore, linksStore, auditStore },
    seedContract,
    seedMatter,
    seedRequest,
    seedDocument,
  };
}

const makeCtx = (overrides: Partial<TenantContext> = {}): TenantContext => ({
  organizationId: 'org-1',
  userId: 'user-1',
  roles: [],
  ...overrides,
});

describe('DocumentsService', () => {
  let service: DocumentsService;
  let mock: ReturnType<typeof makeMockInfra>;
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(async () => {
    mock = makeMockInfra();
    mockStorage = makeMockStorage();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mock.prisma },
        { provide: TenantTransactionService, useValue: mock.tenantTx },
        { provide: AuditService, useValue: mock.audit },
        { provide: STORAGE_SERVICE, useValue: mockStorage },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  describe('create', () => {
    it('creates a draft document with a generated number', async () => {
      const doc = await service.create(makeCtx(), { title: 'Test', type: 'contract_draft' });
      expect(doc.status).toBe(DocumentStatus.draft);
      expect(doc.documentNumber).toMatch(/^DOC-\d{4}-\d{4}$/);
      expect(mock.audit.append).toHaveBeenCalledTimes(1);
    });

    it('throws NotFound when contractId does not belong to org', async () => {
      await expect(
        service.create(makeCtx(), { title: 'X', type: 'contract_draft', contractId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('accepts a valid contractId', async () => {
      mock.seedContract('ctr-1', 'org-1');
      const doc = await service.create(makeCtx(), {
        title: 'X', type: 'contract_draft', contractId: 'ctr-1',
      });
      expect(doc.contractId).toBe('ctr-1');
    });
  });

  describe('uploadVersion (immutable versioning)', () => {
    it('uploads a new version + increments currentVersion', async () => {
      mock.seedDocument('doc-1', 'org-1', { status: DocumentStatus.draft });
      const buffer = Buffer.from('test doc content v2');
      const version = await service.uploadVersion(
        makeCtx(),
        'doc-1',
        { filename: 'test.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        buffer,
      );
      expect(version.versionNumber).toBe(2); // doc had currentVersion=1 already
      expect(version.storageKey).toContain('doc-1');
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      expect(mock.audit.append).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequest when uploading a version to an approved document (immutable)', async () => {
      mock.seedDocument('doc-1', 'org-1', { status: DocumentStatus.approved });
      await expect(
        service.uploadVersion(
          makeCtx(),
          'doc-1',
          { filename: 'x.docx', mimeType: 'application/octet-stream' },
          Buffer.from('content'),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest when uploading to an archived document', async () => {
      mock.seedDocument('doc-1', 'org-1', { status: DocumentStatus.archived });
      await expect(
        service.uploadVersion(
          makeCtx(),
          'doc-1',
          { filename: 'x.docx', mimeType: 'application/octet-stream' },
          Buffer.from('content'),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('computes a SHA-256 content hash on upload', async () => {
      mock.seedDocument('doc-1', 'org-1', { status: DocumentStatus.draft });
      const buffer = Buffer.from('deterministic content');
      const version = await service.uploadVersion(
        makeCtx(),
        'doc-1',
        { filename: 'x.docx', mimeType: 'application/octet-stream' },
        buffer,
      );
      expect(version.contentHash).toHaveLength(64); // SHA-256 hex
      expect(version.contentHash).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('transition', () => {
    it('transitions draft → under_review', async () => {
      mock.seedDocument('doc-1', 'org-1', { status: DocumentStatus.draft });
      const updated = await service.transition(makeCtx(), 'doc-1', DocumentStatus.under_review);
      expect(updated.status).toBe(DocumentStatus.under_review);
    });

    it('transitions under_review → approved + sets approvedBy/approvedAt', async () => {
      mock.seedDocument('doc-1', 'org-1', { status: DocumentStatus.under_review, currentVersion: 1 });
      const updated = await service.transition(makeCtx(), 'doc-1', DocumentStatus.approved);
      expect(updated.status).toBe(DocumentStatus.approved);
      expect(updated.approvedBy).toBe('user-1');
      expect(updated.approvedAt).toBeTruthy();
    });

    it('marks the latest version as approved when transitioning to approved', async () => {
      mock.seedDocument('doc-1', 'org-1', {
        status: DocumentStatus.under_review,
        currentVersion: 3,
      });
      await service.transition(makeCtx(), 'doc-1', DocumentStatus.approved);
      expect(mock.txClient.documentVersion.updateMany).toHaveBeenCalledWith({
        where: { documentId: 'doc-1', versionNumber: 3 },
        data: expect.objectContaining({
          approvedBy: 'user-1',
          approvedAt: expect.any(Date),
          virusScanStatus: VirusScanStatus.clean,
        }),
      });
    });

    it('throws BadRequest for invalid transition (draft → approved)', async () => {
      mock.seedDocument('doc-1', 'org-1', { status: DocumentStatus.draft });
      await expect(
        service.transition(makeCtx(), 'doc-1', DocumentStatus.approved),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest for approved → draft (immutable)', async () => {
      mock.seedDocument('doc-1', 'org-1', { status: DocumentStatus.approved });
      await expect(
        service.transition(makeCtx(), 'doc-1', DocumentStatus.draft),
      ).rejects.toThrow(BadRequestException);
    });

    it('is idempotent when transitioning to the same status', async () => {
      mock.seedDocument('doc-1', 'org-1', { status: DocumentStatus.draft });
      const result = await service.transition(makeCtx(), 'doc-1', DocumentStatus.draft);
      expect(result.status).toBe(DocumentStatus.draft);
      expect(mock.audit.append).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates a draft document', async () => {
      mock.seedDocument('doc-1', 'org-1');
      const updated = await service.update(makeCtx(), 'doc-1', { title: 'Updated' });
      expect(updated.title).toBe('Updated');
    });

    it('throws Conflict when rowVersion mismatch', async () => {
      mock.seedDocument('doc-1', 'org-1', { rowVersion: 5 });
      await expect(
        service.update(makeCtx(), 'doc-1', { title: 'X', rowVersion: 3 }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequest when updating an approved document', async () => {
      mock.seedDocument('doc-1', 'org-1', { status: DocumentStatus.approved });
      await expect(
        service.update(makeCtx(), 'doc-1', { title: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Legal Hold (Rule 10)', () => {
    it('toggles Legal Hold on', async () => {
      mock.seedDocument('doc-1', 'org-1', { legalHold: false });
      const updated = await service.setLegalHold(makeCtx(), 'doc-1', true, 'litigation pending');
      expect(updated.legalHold).toBe(true);
    });

    it('toggles Legal Hold off', async () => {
      mock.seedDocument('doc-1', 'org-1', { legalHold: true });
      const updated = await service.setLegalHold(makeCtx(), 'doc-1', false);
      expect(updated.legalHold).toBe(false);
    });

    it('blocks soft-delete when Legal Hold is active', async () => {
      mock.seedDocument('doc-1', 'org-1', { legalHold: true });
      await expect(
        service.softDelete(makeCtx(), 'doc-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows soft-delete when Legal Hold is off', async () => {
      mock.seedDocument('doc-1', 'org-1', { legalHold: false });
      const result = await service.softDelete(makeCtx(), 'doc-1');
      expect(result.success).toBe(true);
    });

    it('is idempotent when Legal Hold is already in the requested state', async () => {
      mock.seedDocument('doc-1', 'org-1', { legalHold: true });
      const result = await service.setLegalHold(makeCtx(), 'doc-1', true);
      expect(result.legalHold).toBe(true);
      // Should NOT have called audit (no change)
      expect(mock.audit.append).not.toHaveBeenCalled();
    });
  });

  describe('Retention', () => {
    it('sets retentionUntil date', async () => {
      mock.seedDocument('doc-1', 'org-1');
      const updated = await service.setRetention(
        makeCtx(),
        'doc-1',
        '2030-01-01T00:00:00.000Z',
        '7-year retention policy',
      );
      expect(updated.retentionUntil).toBeTruthy();
    });

    it('clears retentionUntil when no date provided', async () => {
      mock.seedDocument('doc-1', 'org-1', { retentionUntil: new Date('2030-01-01') });
      const updated = await service.setRetention(makeCtx(), 'doc-1', undefined);
      expect(updated.retentionUntil).toBeNull();
    });
  });

  describe('Contract links', () => {
    it('links a document to a contract', async () => {
      mock.seedContract('ctr-1', 'org-1');
      mock.seedDocument('doc-1', 'org-1');
      const link = await service.linkToContract(makeCtx(), 'ctr-1', 'doc-1', 'source');
      expect(link.contractId).toBe('ctr-1');
      expect(link.documentId).toBe('doc-1');
      expect(link.linkType).toBe('source');
    });

    it('throws Conflict when link already exists', async () => {
      mock.seedContract('ctr-1', 'org-1');
      mock.seedDocument('doc-1', 'org-1');
      await service.linkToContract(makeCtx(), 'ctr-1', 'doc-1', 'source');
      await expect(
        service.linkToContract(makeCtx(), 'ctr-1', 'doc-1', 'source'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getDownloadUrl', () => {
    it('generates a signed download URL + logs audit', async () => {
      mock.seedDocument('doc-1', 'org-1', { currentVersion: 1 });
      // Add a version row
      mock.stores.versionsStore.push({
        id: 'ver-1',
        documentId: 'doc-1',
        organizationId: 'org-1',
        versionNumber: 1,
        storageKey: 'mock-key',
        filename: 'test.docx',
        mimeType: 'application/octet-stream',
        sizeBytes: 100,
        contentHash: 'hash123',
        uploadedBy: 'user-1',
        approvedBy: null,
        approvedAt: null,
        virusScanStatus: 'pending',
        createdAt: new Date(),
      });

      const result = await service.getDownloadUrl(makeCtx(), 'doc-1');
      expect(result.url).toContain('signed=true');
      expect(result.filename).toBe('test.docx');
      expect(mock.audit.append).toHaveBeenCalledTimes(1);
      expect(mock.audit.append.mock.calls[0]![0]).toMatchObject({
        action: 'download',
        objectType: 'document',
      });
    });
  });
});
