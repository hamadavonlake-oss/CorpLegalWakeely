import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from '../webhooks.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { AuditService } from '../../audit/audit.service';
import type { TenantContext } from '@glo/shared';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';

function makeMockInfra() {
  const webhooksStore: Array<Record<string, unknown>> = [];
  const deliveriesStore: Array<Record<string, unknown>> = [];

  const prisma = {
    webhook: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `wh-${webhooksStore.length + 1}`, ...data, rowVersion: 0, createdAt: new Date(), updatedAt: new Date(), deliveries: [] };
        webhooksStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return webhooksStore.find(
          (w) => w.id === where.id && w.organizationId === where.organizationId && (where.deletedAt === null ? w.deletedAt === null : true),
        ) ?? null;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return webhooksStore.filter(
          (w) => w.organizationId === where.organizationId && (where.deletedAt === null ? w.deletedAt === null : true) && (where.isActive !== undefined ? w.isActive === where.isActive : true),
        );
      }),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return webhooksStore.filter(
          (w) => w.organizationId === where.organizationId && (where.deletedAt === null ? w.deletedAt === null : true),
        ).length;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = webhooksStore.find((w) => w.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { rowVersion: (row.rowVersion as number) + 1 });
        return row;
      }),
    },
    webhookDelivery: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `dl-${deliveriesStore.length + 1}`, ...data, createdAt: new Date() };
        deliveriesStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return deliveriesStore.find((d) => d.id === where.id && d.organizationId === where.organizationId) ?? null;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const statusFilter = where.status as { in?: string[] } | string | undefined;
        return deliveriesStore.filter(
          (d) =>
            d.organizationId === where.organizationId &&
            (where.webhookId ? d.webhookId === where.webhookId : true) &&
            (statusFilter
              ? typeof statusFilter === 'object' && Array.isArray(statusFilter.in)
                ? statusFilter.in.includes(d.status as string)
                : typeof statusFilter === 'string' && d.status === statusFilter
              : true),
        );
      }),
      count: jest.fn(async () => deliveriesStore.length),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = deliveriesStore.find((d) => d.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
    },
  };

  const tenantTx = {
    runInTenantContext: jest.fn(async <T>(orgId: string, fn: (tx: typeof prisma) => Promise<T>) => fn(prisma)),
  };

  const audit = { append: jest.fn(async () => ({})) };

  const seedWebhook = (id: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id, organizationId: orgId, name: 'Test Webhook', nameEn: null,
      url: 'https://example.com/webhook', secretHash: 'hashed-secret',
      events: [], isActive: true, verifySsl: true, secretHeaderName: 'X-Webhook-Signature',
      createdBy: 'user-1', deletedAt: null, deletedBy: null, rowVersion: 0,
      createdAt: new Date(), updatedAt: new Date(),
      ...overrides,
    };
    webhooksStore.push(row);
    return row;
  };

  return { prisma, tenantTx, audit, seedWebhook, stores: { webhooksStore, deliveriesStore } };
}

const makeCtx = (): TenantContext => ({ organizationId: 'org-1', userId: 'user-1', roles: [] });

describe('WebhooksService', () => {
  let service: WebhooksService;
  let mock: ReturnType<typeof makeMockInfra>;

  beforeEach(async () => {
    mock = makeMockInfra();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: mock.prisma },
        { provide: TenantTransactionService, useValue: mock.tenantTx },
        { provide: AuditService, useValue: mock.audit },
      ],
    }).compile();
    service = module.get(WebhooksService);
  });

  describe('create', () => {
    it('creates a webhook and returns the plaintext secret', async () => {
      const result = await service.create(makeCtx(), {
        name: 'Test Hook',
        url: 'https://example.com/webhook',
      });
      expect(result.webhook.name).toBe('Test Hook');
      expect(result.secret).toHaveLength(64); // 32 bytes hex = 64 chars
      expect(mock.audit.append).toHaveBeenCalledTimes(1);
    });

    it('rejects URL with private IP (SSRF prevention)', async () => {
      await expect(
        service.create(makeCtx(), { name: 'X', url: 'http://10.0.0.1/webhook' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects URL with loopback IP', async () => {
      await expect(
        service.create(makeCtx(), { name: 'X', url: 'http://127.0.0.1/webhook' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects URL with localhost', async () => {
      await expect(
        service.create(makeCtx(), { name: 'X', url: 'http://localhost:3000/webhook' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects URL with 192.168.x private range', async () => {
      await expect(
        service.create(makeCtx(), { name: 'X', url: 'http://192.168.1.1/webhook' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects URL with 172.16.x private range', async () => {
      await expect(
        service.create(makeCtx(), { name: 'X', url: 'http://172.16.0.1/webhook' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-HTTP(S) protocol', async () => {
      await expect(
        service.create(makeCtx(), { name: 'X', url: 'ftp://example.com/webhook' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts valid HTTPS URL', async () => {
      const result = await service.create(makeCtx(), {
        name: 'Valid Hook',
        url: 'https://api.example.com/webhooks/legal-events',
      });
      expect(result.webhook.url).toBe('https://api.example.com/webhooks/legal-events');
    });

    it('stores secret as Argon2id hash (not plaintext)', async () => {
      const result = await service.create(makeCtx(), {
        name: 'Hash Test',
        url: 'https://example.com/wh',
      });
      // The secretHash should be an Argon2 hash, not the plaintext secret
      expect(result.webhook.secretHash).not.toBe(result.secret);
      expect(result.webhook.secretHash).toMatch(/^\$argon2id\$/);
      // Verify the hash matches the plaintext
      const valid = await argon2.verify(result.webhook.secretHash as string, result.secret);
      expect(valid).toBe(true);
    });
  });

  describe('emitEvent', () => {
    it('creates delivery records for matching webhooks', async () => {
      mock.seedWebhook('wh-1', 'org-1', { events: ['contract.created'] });
      mock.seedWebhook('wh-2', 'org-1', { events: [] }); // subscribes to all
      mock.seedWebhook('wh-3', 'org-1', { events: ['approval.completed'] }); // doesn't match

      const result = await service.emitEvent(
        'org-1',
        'contract.created',
        {
          id: 'evt-1',
          type: 'contract.created',
          version: '0.1.0',
          organization_id: 'org-1',
          occurred_at: new Date().toISOString(),
          data: { contractId: 'ctr-1' },
          delivery_attempt: 1,
        },
        'test-secret-32-bytes-hex-string-64-chars!!',
      );

      expect(result.delivered).toBe(2); // wh-1 (matches) + wh-2 (all events)
      expect(mock.stores.deliveriesStore).toHaveLength(2);
    });

    it('creates HMAC-SHA256 signature', async () => {
      mock.seedWebhook('wh-1', 'org-1');

      const secret = 'my-test-secret-for-hmac-signing-32-bytes!';
      await service.emitEvent(
        'org-1',
        'contract.created',
        {
          id: 'evt-1',
          type: 'contract.created',
          version: '0.1.0',
          organization_id: 'org-1',
          occurred_at: new Date().toISOString(),
          data: {},
          delivery_attempt: 1,
        },
        secret,
      );

      const delivery = mock.stores.deliveriesStore[0]!;
      // Signature should be 64 hex chars (SHA-256)
      expect(delivery.signature).toHaveLength(64);
      expect(delivery.signature).toMatch(/^[a-f0-9]+$/);
    });

    it('does not deliver to inactive webhooks', async () => {
      mock.seedWebhook('wh-1', 'org-1', { isActive: false });
      mock.seedWebhook('wh-2', 'org-1', { isActive: true });

      const result = await service.emitEvent(
        'org-1',
        'test.event',
        { id: 'evt-1', type: 'test.event', version: '0.1.0', organization_id: 'org-1', occurred_at: new Date().toISOString(), data: {}, delivery_attempt: 1 },
        'test-secret',
      );

      expect(result.delivered).toBe(1); // only the active one
    });
  });

  describe('findOne', () => {
    it('returns the webhook', async () => {
      mock.seedWebhook('wh-1', 'org-1');
      const w = await service.findOne(makeCtx(), 'wh-1');
      expect(w.id).toBe('wh-1');
    });

    it('throws NotFound for non-existent webhook', async () => {
      await expect(service.findOne(makeCtx(), 'non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates webhook name', async () => {
      mock.seedWebhook('wh-1', 'org-1');
      const w = await service.update(makeCtx(), 'wh-1', { name: 'Updated' });
      expect(w.name).toBe('Updated');
    });

    it('rejects URL update with private IP (SSRF)', async () => {
      mock.seedWebhook('wh-1', 'org-1');
      await expect(
        service.update(makeCtx(), 'wh-1', { url: 'http://10.0.0.5/wh' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('softDelete', () => {
    it('soft-deletes a webhook', async () => {
      mock.seedWebhook('wh-1', 'org-1');
      const result = await service.softDelete(makeCtx(), 'wh-1');
      expect(result.success).toBe(true);
      expect(mock.stores.webhooksStore[0]!.deletedAt).toBeTruthy();
      expect(mock.stores.webhooksStore[0]!.isActive).toBe(false);
    });
  });

  describe('retryDelivery', () => {
    it('resets a dead-lettered delivery to pending', async () => {
      mock.seedWebhook('wh-1', 'org-1');
      mock.stores.deliveriesStore.push({
        id: 'dl-1', organizationId: 'org-1', webhookId: 'wh-1',
        eventType: 'test.event', payload: {}, signature: 'sig',
        status: 'dead_letter', attemptCount: 5, maxAttempts: 5,
        nextRetryAt: null, firstAttemptAt: new Date(), completedAt: new Date(),
        createdAt: new Date(),
        webhook: mock.stores.webhooksStore[0],
      });

      const result = await service.retryDelivery(makeCtx(), 'dl-1');
      expect(result.status).toBe('pending');
      expect(result.attemptCount).toBe(0);
    });

    it('throws BadRequest for non-dead-lettered delivery', async () => {
      mock.seedWebhook('wh-1', 'org-1');
      mock.stores.deliveriesStore.push({
        id: 'dl-1', organizationId: 'org-1', webhookId: 'wh-1',
        eventType: 'test.event', payload: {}, signature: 'sig',
        status: 'success', attemptCount: 1, maxAttempts: 5,
        createdAt: new Date(),
        webhook: mock.stores.webhooksStore[0],
      });

      await expect(service.retryDelivery(makeCtx(), 'dl-1')).rejects.toThrow(BadRequestException);
    });
  });
});
