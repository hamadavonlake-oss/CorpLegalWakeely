import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import { TenantTransactionService } from '../database/tenant-transaction.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsEventBus } from './notifications-event-bus';
import { EmailService } from './email.service';
import type { NotificationEvent } from './notifications-event-bus';
import {
  NOTIFICATION_SEVERITY,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from './notification-types';
import { ERROR_CODES } from '@glo/shared';
import type { PaginationDto, TenantContext } from '@glo/shared';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
    private readonly audit: AuditService,
    private readonly eventBus: NotificationsEventBus,
    private readonly email: EmailService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // Create + Emit
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create a notification for a user, persist it, push it via SSE,
   * and (if enabled) send an email.
   *
   * This is the canonical way to send a notification. Other modules
   * call this method — they don't directly insert into the notifications
   * table or publish to the event bus.
   */
  async create(
    ctx: TenantContext,
    input: {
      userId: string;
      type: string;
      title: string;
      body: string;
      severity?: string;
      actionUrl?: string;
      objectType?: string;
      objectId?: string;
      scheduledFor?: string;
    },
  ) {
    // Check user preferences before creating
    const prefs = await this.getOrCreatePreferences(ctx, input.userId);

    // Check if this notification type is enabled
    const enabledTypes = (prefs.enabledTypes as Record<string, boolean> | null) ?? {};
    const typeEnabled = enabledTypes[input.type] ?? true; // default enabled
    if (!prefs.inAppEnabled || !typeEnabled) {
      this.logger.debug(
        `Notification suppressed for user ${input.userId} (type=${input.type}, ` +
          `inAppEnabled=${prefs.inAppEnabled}, typeEnabled=${typeEnabled})`,
      );
      return null;
    }

    // Check quiet hours (deferred: schedule for later if in quiet hours)
    // For MVP, we just deliver immediately

    // Persist the notification
    const notification = await this.prisma.notification.create({
      data: {
        organizationId: ctx.organizationId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        severity: input.severity ?? NOTIFICATION_SEVERITY.INFO,
        actionUrl: input.actionUrl,
        objectType: input.objectType,
        objectId: input.objectId,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
        deliveryStatus: 'delivered',
      },
    });

    // Build the event for SSE
    const event: NotificationEvent = {
      id: notification.id,
      userId: notification.userId,
      organizationId: notification.organizationId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      severity: notification.severity,
      actionUrl: notification.actionUrl ?? undefined,
      objectType: notification.objectType ?? undefined,
      objectId: notification.objectId ?? undefined,
      createdAt: notification.createdAt,
    };

    // Push to SSE (drops silently if no active connection)
    this.eventBus.publish(event);

    // Send email if enabled
    if (prefs.emailEnabled) {
      const user = await this.prisma.user.findFirst({
        where: { id: input.userId, organizationId: ctx.organizationId, deletedAt: null },
        select: { email: true },
      });
      if (user) {
        // Don't await — email sending is fire-and-forget for performance
        this.email.sendNotification({
          to: user.email,
          title: notification.title,
          body: notification.body,
          actionUrl: notification.actionUrl ?? undefined,
        }).catch((err) => {
          this.logger.error(`Email send failed: ${(err as Error).message}`);
        });
      }
    }

    return notification;
  }

  /**
   * Create notifications for multiple users (broadcast).
   * Useful for "approval needed" notifications to a group of approvers.
   */
  async createMany(
    ctx: TenantContext,
    userIds: string[],
    input: {
      type: string;
      title: string;
      body: string;
      severity?: string;
      actionUrl?: string;
      objectType?: string;
      objectId?: string;
    },
  ) {
    const results = [];
    for (const userId of userIds) {
      const n = await this.create(ctx, { ...input, userId });
      if (n) results.push(n);
    }
    return { count: results.length };
  }

  // ═══════════════════════════════════════════════════════════════
  // Read
  // ═══════════════════════════════════════════════════════════════

  async list(
    ctx: TenantContext,
    pagination: PaginationDto & {
      unreadOnly?: boolean;
      type?: string;
    },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const where = {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      ...(pagination.unreadOnly ? { readAt: null } : {}),
      ...(pagination.type ? { type: pagination.type } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: rows,
      meta: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
      },
    };
  }

  async getUnreadCount(ctx: TenantContext): Promise<{ unread: number; total: number }> {
    const [unread, total] = await Promise.all([
      this.prisma.notification.count({
        where: { organizationId: ctx.organizationId, userId: ctx.userId, readAt: null },
      }),
      this.prisma.notification.count({
        where: { organizationId: ctx.organizationId, userId: ctx.userId },
      }),
    ]);
    return { unread, total };
  }

  // ═══════════════════════════════════════════════════════════════
  // Mark Read / Unread
  // ═══════════════════════════════════════════════════════════════

  async markRead(ctx: TenantContext, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, organizationId: ctx.organizationId, userId: ctx.userId },
    });
    if (!notification) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Notification not found' },
      });
    }
    if (notification.readAt) {
      return notification; // idempotent
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(ctx: TenantContext) {
    const result = await this.prisma.notification.updateMany({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { success: true, marked: result.count };
  }

  async markUnread(ctx: TenantContext, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, organizationId: ctx.organizationId, userId: ctx.userId },
    });
    if (!notification) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Notification not found' },
      });
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: null },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Delete
  // ═══════════════════════════════════════════════════════════════

  async delete(ctx: TenantContext, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, organizationId: ctx.organizationId, userId: ctx.userId },
    });
    if (!notification) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Notification not found' },
      });
    }
    await this.prisma.notification.delete({ where: { id } });
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════
  // Preferences
  // ═══════════════════════════════════════════════════════════════

  async getPreferences(ctx: TenantContext) {
    return this.getOrCreatePreferences(ctx, ctx.userId);
  }

  async updatePreferences(
    ctx: TenantContext,
    input: {
      inAppEnabled?: boolean;
      emailEnabled?: boolean;
      enabledTypes?: Record<string, boolean>;
      digestFrequency?: string;
      quietHours?: { start: string; end: string; timezone: string };
    },
  ) {
    const existing = await this.getOrCreatePreferences(ctx, ctx.userId);

    const updateData: Record<string, unknown> = {};
    if (input.inAppEnabled !== undefined) updateData.inAppEnabled = input.inAppEnabled;
    if (input.emailEnabled !== undefined) updateData.emailEnabled = input.emailEnabled;
    if (input.digestFrequency !== undefined) updateData.digestFrequency = input.digestFrequency;
    if (input.enabledTypes !== undefined) {
      updateData.enabledTypes = input.enabledTypes as Prisma.InputJsonValue;
    }
    if (input.quietHours !== undefined) {
      updateData.quietHours = input.quietHours as Prisma.InputJsonValue;
    }

    return this.prisma.notificationPreference.upsert({
      where: { userId: ctx.userId },
      update: updateData,
      create: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        inAppEnabled: input.inAppEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.inAppEnabled,
        emailEnabled: input.emailEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.emailEnabled,
        enabledTypes: (input.enabledTypes ?? DEFAULT_NOTIFICATION_PREFERENCES.enabledTypes) as Prisma.InputJsonValue,
        digestFrequency: input.digestFrequency ?? DEFAULT_NOTIFICATION_PREFERENCES.digestFrequency,
        quietHours: input.quietHours
          ? (input.quietHours as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // SSE helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Subscribe to the user's real-time notification stream (for SSE endpoint).
   */
  subscribeToUserStream(userId: string) {
    return this.eventBus.subscribe(userId);
  }

  /**
   * Unsubscribe the user's stream (called when SSE connection closes).
   */
  unsubscribeUserStream(userId: string) {
    this.eventBus.unsubscribe(userId);
  }

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the user's preferences, or create default preferences if none exist.
   */
  private async getOrCreatePreferences(ctx: TenantContext, userId: string) {
    // Verify user belongs to org
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'User not found in organization' },
      });
    }

    let prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!prefs) {
      prefs = await this.prisma.notificationPreference.create({
        data: {
          organizationId: ctx.organizationId,
          userId,
          inAppEnabled: DEFAULT_NOTIFICATION_PREFERENCES.inAppEnabled,
          emailEnabled: DEFAULT_NOTIFICATION_PREFERENCES.emailEnabled,
          enabledTypes: DEFAULT_NOTIFICATION_PREFERENCES.enabledTypes as Prisma.InputJsonValue,
          digestFrequency: DEFAULT_NOTIFICATION_PREFERENCES.digestFrequency,
          quietHours: Prisma.JsonNull,
        },
      });
    }
    return prefs;
  }
}
