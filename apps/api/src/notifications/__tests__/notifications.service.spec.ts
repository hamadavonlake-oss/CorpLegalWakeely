import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsEventBus } from '../notifications-event-bus';
import { EmailService } from '../email.service';
import type { TenantContext } from '@glo/shared';
import { NotFoundException } from '@nestjs/common';

function makeMockInfra() {
  const notificationsStore: Array<Record<string, unknown>> = [];
  const preferencesStore: Array<Record<string, unknown>> = [];
  const usersStore: Array<Record<string, unknown>> = [];

  const prisma = {
    notification: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `notif-${notificationsStore.length + 1}`,
          ...data,
          readAt: null,
          createdAt: new Date(),
        };
        notificationsStore.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          notificationsStore.find(
            (n) =>
              (where.id ? n.id === where.id : true) &&
              (where.organizationId ? n.organizationId === where.organizationId : true) &&
              (where.userId ? n.userId === where.userId : true),
          ) ?? null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return notificationsStore.filter(
          (n) =>
            n.organizationId === where.organizationId &&
            n.userId === where.userId &&
            (where.readAt !== undefined
              ? where.readAt === null
                ? n.readAt === null
                : true
              : true) &&
            (where.type ? n.type === where.type : true),
        );
      }),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return notificationsStore.filter(
          (n) =>
            n.organizationId === where.organizationId &&
            n.userId === where.userId &&
            (where.readAt !== undefined
              ? where.readAt === null
                ? n.readAt === null
                : true
              : true),
        ).length;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = notificationsStore.find((n) => n.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const n of notificationsStore) {
          if (
            n.organizationId === where.organizationId &&
            n.userId === where.userId &&
            (where.readAt === null ? n.readAt === null : true)
          ) {
            Object.assign(n, data);
            count++;
          }
        }
        return { count };
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const idx = notificationsStore.findIndex((n) => n.id === where.id);
        if (idx >= 0) return notificationsStore.splice(idx, 1)[0];
        throw new Error('not found');
      }),
    },
    notificationPreference: {
      findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => {
        return preferencesStore.find((p) => p.userId === where.userId) ?? null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `pref-${preferencesStore.length + 1}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        preferencesStore.push(row);
        return row;
      }),
      upsert: jest.fn(async ({ where, update, create }: { where: { userId: string }; update: Record<string, unknown>; create: Record<string, unknown> }) => {
        const existing = preferencesStore.find((p) => p.userId === where.userId);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }
        const row = { id: `pref-${preferencesStore.length + 1}`, ...create, createdAt: new Date(), updatedAt: new Date() };
        preferencesStore.push(row);
        return row;
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
  };

  const tenantTx = {
    runInTenantContext: jest.fn(),
  };

  const audit = {
    append: jest.fn(async () => ({})),
  };

  const eventBus = {
    publish: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    getActiveConnectionCount: jest.fn(() => 0),
  };

  const email = {
    send: jest.fn(async () => true),
    sendNotification: jest.fn(async () => true),
  };

  const seedUser = (id: string, orgId: string) => {
    usersStore.push({ id, organizationId: orgId, deletedAt: null, email: `${id}@example.com` });
  };
  const seedNotification = (id: string, userId: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id,
      organizationId: orgId,
      userId,
      type: 'request.submitted',
      title: 'Test',
      body: 'Body',
      severity: 'info',
      actionUrl: null,
      objectType: null,
      objectId: null,
      readAt: null,
      createdAt: new Date(),
      scheduledFor: null,
      deliveryStatus: 'delivered',
      ...overrides,
    };
    notificationsStore.push(row);
    return row;
  };
  const seedPreferences = (userId: string, orgId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      id: `pref-${preferencesStore.length + 1}`,
      organizationId: orgId,
      userId,
      inAppEnabled: true,
      emailEnabled: false,
      enabledTypes: {},
      digestFrequency: 'instant',
      quietHours: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    preferencesStore.push(row);
    return row;
  };

  return {
    prisma,
    tenantTx,
    audit,
    eventBus,
    email,
    stores: { notificationsStore, preferencesStore, usersStore },
    seedUser,
    seedNotification,
    seedPreferences,
  };
}

const makeCtx = (overrides: Partial<TenantContext> = {}): TenantContext => ({
  organizationId: 'org-1',
  userId: 'user-1',
  roles: [],
  ...overrides,
});

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mock: ReturnType<typeof makeMockInfra>;

  beforeEach(async () => {
    mock = makeMockInfra();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mock.prisma },
        { provide: TenantTransactionService, useValue: mock.tenantTx },
        { provide: AuditService, useValue: mock.audit },
        { provide: NotificationsEventBus, useValue: mock.eventBus },
        { provide: EmailService, useValue: mock.email },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  describe('create', () => {
    it('creates a notification + publishes to event bus', async () => {
      mock.seedUser('user-2', 'org-1');
      const n = await service.create(
        { ...makeCtx(), userId: 'user-1' }, // creating on behalf of user-2
        {
          userId: 'user-2',
          type: 'request.submitted',
          title: 'New Request',
          body: 'A new request was submitted',
        },
      );
      // The create call uses ctx.userId (user-1) for preferences lookup but
      // stores the notification with userId=user-2 from the input.
      // Actually wait — let me check the implementation. The create method
      // calls getOrCreatePreferences(ctx, input.userId), so it looks up
      // preferences for user-2 (the recipient). Let me verify.
      expect(n).toBeTruthy();
      expect(mock.eventBus.publish).toHaveBeenCalledTimes(1);
    });

    it('suppresses notification when inAppEnabled is false', async () => {
      mock.seedUser('user-2', 'org-1');
      mock.seedPreferences('user-2', 'org-1', { inAppEnabled: false });

      const n = await service.create(
        makeCtx(),
        {
          userId: 'user-2',
          type: 'request.submitted',
          title: 'Test',
          body: 'Body',
        },
      );

      expect(n).toBeNull();
      expect(mock.eventBus.publish).not.toHaveBeenCalled();
    });

    it('suppresses notification when type is disabled in enabledTypes', async () => {
      mock.seedUser('user-2', 'org-1');
      mock.seedPreferences('user-2', 'org-1', {
        inAppEnabled: true,
        enabledTypes: { 'request.submitted': false },
      });

      const n = await service.create(
        makeCtx(),
        {
          userId: 'user-2',
          type: 'request.submitted',
          title: 'Test',
          body: 'Body',
        },
      );

      expect(n).toBeNull();
    });

    it('delivers notification when type is enabled in enabledTypes', async () => {
      mock.seedUser('user-2', 'org-1');
      mock.seedPreferences('user-2', 'org-1', {
        inAppEnabled: true,
        enabledTypes: { 'request.submitted': true, 'approval.needed': false },
      });

      const n = await service.create(
        makeCtx(),
        {
          userId: 'user-2',
          type: 'request.submitted',
          title: 'Test',
          body: 'Body',
        },
      );

      expect(n).toBeTruthy();
      expect(mock.eventBus.publish).toHaveBeenCalledTimes(1);
    });

    it('throws NotFound when target user does not belong to org', async () => {
      await expect(
        service.create(
          makeCtx(),
          {
            userId: 'non-existent',
            type: 'test',
            title: 'Test',
            body: 'Body',
          },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('sends email when emailEnabled is true', async () => {
      mock.seedUser('user-2', 'org-1');
      mock.seedPreferences('user-2', 'org-1', { emailEnabled: true });

      await service.create(
        makeCtx(),
        {
          userId: 'user-2',
          type: 'request.submitted',
          title: 'Email Test',
          body: 'This should be emailed',
          actionUrl: '/requests/req-1',
        },
      );

      // Email send is fire-and-forget but should be called
      expect(mock.email.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('creates default preferences for user without existing prefs', async () => {
      mock.seedUser('user-2', 'org-1');
      // No preferences seeded — should auto-create defaults

      const n = await service.create(
        makeCtx(),
        {
          userId: 'user-2',
          type: 'test',
          title: 'Test',
          body: 'Body',
        },
      );

      expect(n).toBeTruthy();
      // Verify a preference was created
      expect(mock.stores.preferencesStore).toHaveLength(1);
      expect(mock.stores.preferencesStore[0]!.inAppEnabled).toBe(true);
    });
  });

  describe('list', () => {
    it('returns notifications for the current user only', async () => {
      mock.seedNotification('n-1', 'user-1', 'org-1');
      mock.seedNotification('n-2', 'user-1', 'org-1');
      mock.seedNotification('n-3', 'user-2', 'org-1'); // different user
      mock.seedNotification('n-4', 'user-1', 'org-OTHER'); // different org

      const result = await service.list(makeCtx(), { page: 1, limit: 10 });
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });

    it('filters unread only when unreadOnly=true', async () => {
      mock.seedNotification('n-1', 'user-1', 'org-1', { readAt: null });
      mock.seedNotification('n-2', 'user-1', 'org-1', { readAt: new Date() });
      mock.seedNotification('n-3', 'user-1', 'org-1', { readAt: null });

      const result = await service.list(makeCtx(), { page: 1, limit: 10, unreadOnly: true });
      expect(result.data).toHaveLength(2);
    });

    it('filters by type when type is provided', async () => {
      mock.seedNotification('n-1', 'user-1', 'org-1', { type: 'request.submitted' });
      mock.seedNotification('n-2', 'user-1', 'org-1', { type: 'approval.needed' });

      const result = await service.list(makeCtx(), { page: 1, limit: 10, type: 'approval.needed' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.type).toBe('approval.needed');
    });
  });

  describe('getUnreadCount', () => {
    it('returns unread + total counts', async () => {
      mock.seedNotification('n-1', 'user-1', 'org-1', { readAt: null });
      mock.seedNotification('n-2', 'user-1', 'org-1', { readAt: new Date() });
      mock.seedNotification('n-3', 'user-1', 'org-1', { readAt: null });

      const counts = await service.getUnreadCount(makeCtx());
      expect(counts.unread).toBe(2);
      expect(counts.total).toBe(3);
    });
  });

  describe('markRead', () => {
    it('marks a notification as read', async () => {
      mock.seedNotification('n-1', 'user-1', 'org-1', { readAt: null });

      const n = await service.markRead(makeCtx(), 'n-1');
      expect(n.readAt).toBeTruthy();
    });

    it('is idempotent when already read', async () => {
      const readAt = new Date();
      mock.seedNotification('n-1', 'user-1', 'org-1', { readAt });

      const n = await service.markRead(makeCtx(), 'n-1');
      expect(n.readAt).toEqual(readAt); // unchanged
    });

    it('throws NotFound for non-existent notification', async () => {
      await expect(
        service.markRead(makeCtx(), 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound for notification from a different user (RLS)', async () => {
      mock.seedNotification('n-1', 'user-2', 'org-1');

      await expect(
        service.markRead(makeCtx(), 'n-1'), // ctx.userId is user-1
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllRead', () => {
    it('marks all unread notifications as read', async () => {
      mock.seedNotification('n-1', 'user-1', 'org-1', { readAt: null });
      mock.seedNotification('n-2', 'user-1', 'org-1', { readAt: null });
      mock.seedNotification('n-3', 'user-1', 'org-1', { readAt: new Date() }); // already read

      const result = await service.markAllRead(makeCtx());
      expect(result.success).toBe(true);
      expect(result.marked).toBe(2);
    });

    it('returns 0 marked when no unread notifications', async () => {
      mock.seedNotification('n-1', 'user-1', 'org-1', { readAt: new Date() });

      const result = await service.markAllRead(makeCtx());
      expect(result.marked).toBe(0);
    });
  });

  describe('markUnread', () => {
    it('marks a read notification as unread', async () => {
      mock.seedNotification('n-1', 'user-1', 'org-1', { readAt: new Date() });

      const n = await service.markUnread(makeCtx(), 'n-1');
      expect(n.readAt).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes a notification', async () => {
      mock.seedNotification('n-1', 'user-1', 'org-1');

      const result = await service.delete(makeCtx(), 'n-1');
      expect(result.success).toBe(true);
      expect(mock.stores.notificationsStore).toHaveLength(0);
    });

    it('throws NotFound for non-existent notification', async () => {
      await expect(
        service.delete(makeCtx(), 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('preferences', () => {
    it('returns existing preferences', async () => {
      mock.seedUser('user-1', 'org-1');
      mock.seedPreferences('user-1', 'org-1', { emailEnabled: true });

      const prefs = await service.getPreferences(makeCtx());
      expect(prefs.emailEnabled).toBe(true);
    });

    it('creates default preferences when none exist', async () => {
      mock.seedUser('user-1', 'org-1');

      const prefs = await service.getPreferences(makeCtx());
      expect(prefs.inAppEnabled).toBe(true);
      expect(prefs.emailEnabled).toBe(false);
      expect(prefs.digestFrequency).toBe('instant');
    });

    it('updates preferences', async () => {
      mock.seedUser('user-1', 'org-1');
      mock.seedPreferences('user-1', 'org-1');

      const prefs = await service.updatePreferences(makeCtx(), {
        emailEnabled: true,
        digestFrequency: 'daily',
      });
      expect(prefs.emailEnabled).toBe(true);
      expect(prefs.digestFrequency).toBe('daily');
    });

    it('updates enabledTypes', async () => {
      mock.seedUser('user-1', 'org-1');
      mock.seedPreferences('user-1', 'org-1');

      const prefs = await service.updatePreferences(makeCtx(), {
        enabledTypes: { 'request.submitted': true, 'approval.needed': false },
      });
      expect(prefs.enabledTypes).toEqual({ 'request.submitted': true, 'approval.needed': false });
    });

    it('updates quietHours', async () => {
      mock.seedUser('user-1', 'org-1');
      mock.seedPreferences('user-1', 'org-1');

      const prefs = await service.updatePreferences(makeCtx(), {
        quietHours: { start: '22:00', end: '07:00', timezone: 'Asia/Amman' },
      });
      expect(prefs.quietHours).toEqual({ start: '22:00', end: '07:00', timezone: 'Asia/Amman' });
    });
  });

  describe('subscribeToUserStream / unsubscribeUserStream', () => {
    it('delegates to eventBus.subscribe', () => {
      service.subscribeToUserStream('user-1');
      expect(mock.eventBus.subscribe).toHaveBeenCalledWith('user-1');
    });

    it('delegates to eventBus.unsubscribe', () => {
      service.unsubscribeUserStream('user-1');
      expect(mock.eventBus.unsubscribe).toHaveBeenCalledWith('user-1');
    });
  });
});
