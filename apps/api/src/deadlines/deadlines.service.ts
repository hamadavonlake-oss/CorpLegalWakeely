import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantTransactionService } from '../database/tenant-transaction.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ERROR_CODES } from '@glo/shared';
import { NOTIFICATION_TYPES } from '../notifications/notification-types';
import type { PaginationDto, TenantContext } from '@glo/shared';

@Injectable()
export class DeadlinesService {
  private readonly logger = new Logger(DeadlinesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    ctx: TenantContext,
    input: {
      parentType: 'matter' | 'contract' | 'request';
      parentId: string;
      title: string;
      titleEn?: string;
      description?: string;
      dueDate: string;
      reminderDays?: number;
      assignedTo?: string;
      priority?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      // Validate parent belongs to org
      await this.validateParent(tx, ctx.organizationId, input.parentType, input.parentId);

      // Validate assignedTo if provided
      if (input.assignedTo) {
        const user = await tx.user.findFirst({
          where: { id: input.assignedTo, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true },
        });
        if (!user) {
          throw new NotFoundException({
            success: false,
            error: { code: ERROR_CODES.NOT_FOUND, message: 'Assigned user not found' },
          });
        }
      }

      const deadline = await tx.deadline.create({
        data: {
          organizationId: ctx.organizationId,
          parentType: input.parentType,
          parentId: input.parentId,
          title: input.title,
          titleEn: input.titleEn,
          description: input.description,
          dueDate: new Date(input.dueDate),
          reminderDays: input.reminderDays ?? 7,
          assignedTo: input.assignedTo ?? null,
          priority: input.priority ?? 'medium',
          status: 'pending',
          createdBy: ctx.userId,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'create',
        objectType: 'deadline',
        objectId: deadline.id,
        correlationId: `${input.parentType}:${input.parentId}`,
        afterState: { title: deadline.title, dueDate: deadline.dueDate },
      });

      this.logger.log(`Deadline created: ${deadline.title} due ${deadline.dueDate.toISOString().slice(0, 10)}`);
      return deadline;
    });
  }

  async findOne(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const deadline = await tx.deadline.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!deadline) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Deadline not found' },
        });
      }
      return deadline;
    });
  }

  async list(
    ctx: TenantContext,
    pagination: PaginationDto & {
      parentType?: string;
      parentId?: string;
      status?: string;
      assignedTo?: string;
      upcoming?: boolean;
    },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const where = {
        organizationId: ctx.organizationId,
        deletedAt: null,
        ...(pagination.parentType ? { parentType: pagination.parentType } : {}),
        ...(pagination.parentId ? { parentId: pagination.parentId } : {}),
        ...(pagination.status ? { status: pagination.status } : {}),
        ...(pagination.assignedTo ? { assignedTo: pagination.assignedTo } : {}),
        ...(pagination.upcoming
          ? { dueDate: { gte: new Date() }, status: 'pending' }
          : {}),
      };

      const [rows, total] = await Promise.all([
        tx.deadline.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { dueDate: 'asc' },
        }),
        tx.deadline.count({ where }),
      ]);

      return {
        data: rows,
        meta: {
          page, limit, total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
        },
      };
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: {
      title?: string;
      titleEn?: string;
      description?: string;
      dueDate?: string;
      reminderDays?: number;
      assignedTo?: string;
      priority?: string;
      status?: string;
      rowVersion?: number;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.deadline.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Deadline not found' },
        });
      }

      if (input.rowVersion !== undefined && input.rowVersion !== existing.rowVersion) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Deadline was modified by another user.',
            details: { expectedVersion: existing.rowVersion, providedVersion: input.rowVersion },
          },
        });
      }

      const updateData: Record<string, unknown> = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.titleEn !== undefined) updateData.titleEn = input.titleEn;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.dueDate !== undefined) updateData.dueDate = new Date(input.dueDate);
      if (input.reminderDays !== undefined) updateData.reminderDays = input.reminderDays;
      if (input.assignedTo !== undefined) updateData.assignedTo = input.assignedTo;
      if (input.priority !== undefined) updateData.priority = input.priority;
      if (input.status !== undefined) {
        updateData.status = input.status;
        if (input.status === 'completed') {
          updateData.completedAt = new Date();
        }
      }

      const updated = await tx.deadline.update({
        where: { id },
        data: updateData,
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'deadline',
        objectId: id,
        correlationId: `${existing.parentType}:${existing.parentId}`,
        beforeState: { title: existing.title, status: existing.status },
        afterState: { title: updated.title, status: updated.status },
      });

      return updated;
    });
  }

  async softDelete(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.deadline.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Deadline not found' },
        });
      }

      await tx.deadline.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: ctx.userId, status: 'cancelled' },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'delete',
        objectType: 'deadline',
        objectId: id,
        correlationId: `${existing.parentType}:${existing.parentId}`,
      });

      return { success: true };
    });
  }

  /**
   * Check for deadlines that need reminders sent.
   * Called by a scheduled task (cron) — finds deadlines where:
   *   - status = 'pending'
   *   - reminderSent = false
   *   - dueDate is within reminderDays from now
   *
   * For each, sends a notification to the assigned user and marks reminderSent=true.
   *
   * Returns the count of reminders sent.
   */
  async processReminders(): Promise<{ sent: number; overdue: number }> {
    let sent = 0;
    let overdue = 0;

    // Find all orgs with pending deadlines (we process per-org for RLS)
    const orgIds = await this.prisma.deadline.findMany({
      where: { status: 'pending', reminderSent: false, deletedAt: null },
      select: { organizationId: true },
      distinct: ['organizationId'],
    });

    for (const { organizationId } of orgIds) {
      const result = await this.tenantTx.runInTenantContext(organizationId, async (tx) => {
        const now = new Date();

        // Find deadlines needing reminders (due within reminderDays)
        const needingReminder = await tx.deadline.findMany({
          where: {
            organizationId,
            status: 'pending',
            reminderSent: false,
            deletedAt: null,
          },
        });

        let orgSent = 0;
        let orgOverdue = 0;

        for (const deadline of needingReminder) {
          const reminderDate = new Date(deadline.dueDate);
          reminderDate.setDate(reminderDate.getDate() - deadline.reminderDays);

          // Check if it's time to send a reminder (or if overdue)
          if (now > deadline.dueDate) {
            // Mark as overdue
            await tx.deadline.update({
              where: { id: deadline.id },
              data: { status: 'overdue', reminderSent: true },
            });
            orgOverdue++;

            // Send overdue notification
            if (deadline.assignedTo) {
              try {
                await this.notifications.create(
                  { organizationId, userId: deadline.assignedTo, roles: [] },
                  {
                    userId: deadline.assignedTo,
                    type: NOTIFICATION_TYPES.DEADLINE_OVERDUE,
                    title: 'Deadline overdue',
                    body: `The deadline "${deadline.title}" is now overdue (was due ${deadline.dueDate.toISOString().slice(0, 10)})`,
                    severity: 'error',
                    actionUrl: `/${deadline.parentType === 'request' ? 'requests' : deadline.parentType === 'matter' ? 'matters' : 'contracts'}/${deadline.parentId}`,
                    objectType: 'deadline',
                    objectId: deadline.id,
                  },
                );
              } catch {
                // Notification failure shouldn't break the reminder loop
              }
            }
          } else if (now >= reminderDate) {
            // Time to send reminder
            await tx.deadline.update({
              where: { id: deadline.id },
              data: { reminderSent: true },
            });
            orgSent++;

            if (deadline.assignedTo) {
              try {
                const daysLeft = Math.ceil(
                  (deadline.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
                );
                await this.notifications.create(
                  { organizationId, userId: deadline.assignedTo, roles: [] },
                  {
                    userId: deadline.assignedTo,
                    type: NOTIFICATION_TYPES.DEADLINE_APPROACHING,
                    title: 'Deadline approaching',
                    body: `The deadline "${deadline.title}" is due in ${daysLeft} day(s)`,
                    severity: 'warning',
                    actionUrl: `/${deadline.parentType === 'request' ? 'requests' : deadline.parentType === 'matter' ? 'matters' : 'contracts'}/${deadline.parentId}`,
                    objectType: 'deadline',
                    objectId: deadline.id,
                  },
                );
              } catch {
                // Ignore notification failures
              }
            }
          }
        }

        return { orgSent, orgOverdue };
      });

      sent += result.orgSent;
      overdue += result.orgOverdue;
    }

    this.logger.log(`Processed deadline reminders: ${sent} sent, ${overdue} overdue`);
    return { sent, overdue };
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private async validateParent(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    organizationId: string,
    parentType: string,
    parentId: string,
  ): Promise<void> {
    let exists = false;

    if (parentType === 'matter') {
      const matter = await tx.matter.findFirst({
        where: { id: parentId, organizationId, deletedAt: null },
        select: { id: true },
      });
      exists = !!matter;
    } else if (parentType === 'contract') {
      const contract = await tx.contract.findFirst({
        where: { id: parentId, organizationId, deletedAt: null },
        select: { id: true },
      });
      exists = !!contract;
    } else if (parentType === 'request') {
      const request = await tx.legalRequest.findFirst({
        where: { id: parentId, organizationId, deletedAt: null },
        select: { id: true },
      });
      exists = !!request;
    } else {
      throw new BadRequestException({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Invalid parent type: ${parentType}` },
      });
    }

    if (!exists) {
      throw new NotFoundException({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: `Parent ${parentType} not found` },
      });
    }
  }
}
