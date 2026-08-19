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
import { ERROR_CODES, LegalRequestStatus, ClassificationLevel } from '@glo/shared';
import type { PaginationDto, TenantContext } from '@glo/shared';
import { isLegalRequestTransitionAllowed } from './legal-request.state-machine';

@Injectable()
export class LegalRequestsService {
  private readonly logger = new Logger(LegalRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
    private readonly audit: AuditService,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────

  async create(
    ctx: TenantContext,
    input: {
      title: string;
      titleEn?: string;
      description?: string;
      type?: string;
      priority?: string;
      classification?: ClassificationLevel;
      entityId?: string;
      assignedTo?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      // If entityId provided, verify it belongs to this org.
      if (input.entityId) {
        const entity = await tx.entity.findFirst({
          where: { id: input.entityId, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true },
        });
        if (!entity) {
          throw new NotFoundException({
            success: false,
            error: { code: ERROR_CODES.NOT_FOUND, message: 'Entity not found in this organization' },
          });
        }
      }

      // If assignedTo provided, verify it belongs to this org.
      if (input.assignedTo) {
        const user = await tx.user.findFirst({
          where: { id: input.assignedTo, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true },
        });
        if (!user) {
          throw new NotFoundException({
            success: false,
            error: { code: ERROR_CODES.NOT_FOUND, message: 'Assignee not found in this organization' },
          });
        }
      }

      // Generate per-org sequential request number: REQ-YYYY-NNNN
      const requestNumber = await this.generateRequestNumber(tx, ctx.organizationId);

      const request = await tx.legalRequest.create({
        data: {
          organizationId: ctx.organizationId,
          entityId: input.entityId ?? null,
          requestNumber,
          title: input.title,
          titleEn: input.titleEn,
          description: input.description,
          type: input.type,
          priority: input.priority ?? 'medium',
          status: LegalRequestStatus.draft,
          requestedBy: ctx.userId,
          assignedTo: input.assignedTo ?? null,
          classification: 'internal',
        },
      });

      // Audit log
      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'create',
        objectType: 'legal_request',
        objectId: request.id,
        correlationId: request.requestNumber,
        afterState: {
          title: request.title,
          status: request.status,
          type: request.type,
          priority: request.priority,
        },
      });

      this.logger.log(`Legal request created: ${request.requestNumber} by ${ctx.userId}`);
      return request;
    });
  }

  // ─── Read ─────────────────────────────────────────────────────────

  async findOne(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const request = await tx.legalRequest.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        include: {
          entity: true,
          matterLinks: { include: { matter: true } },
        },
      });
      if (!request) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Legal request not found' },
        });
      }
      return request;
    });
  }

  async list(
    ctx: TenantContext,
    pagination: PaginationDto & { status?: LegalRequestStatus },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const where = {
        organizationId: ctx.organizationId,
        deletedAt: null,
        ...(pagination.status ? { status: pagination.status } : {}),
      };

      const [rows, total] = await Promise.all([
        tx.legalRequest.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        tx.legalRequest.count({ where }),
      ]);

      return {
        data: rows,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
        },
      };
    });
  }

  // ─── Update ──────────────────────────────────────────────────────

  async update(
    ctx: TenantContext,
    id: string,
    input: {
      title?: string;
      titleEn?: string;
      description?: string;
      type?: string;
      priority?: string;
      entityId?: string;
      assignedTo?: string;
      classification?: string;
      rowVersion?: number;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.legalRequest.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Legal request not found' },
        });
      }

      // Optimistic locking
      if (input.rowVersion !== undefined && input.rowVersion !== existing.rowVersion) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Legal request was modified by another user. Please refresh and try again.',
            details: { expectedVersion: existing.rowVersion, providedVersion: input.rowVersion },
          },
        });
      }

      // Only allow updates while in draft or waiting_for_information
      const editable: LegalRequestStatus[] = [
        LegalRequestStatus.draft,
        LegalRequestStatus.waiting_for_information,
      ];
      if (!editable.includes(existing.status as LegalRequestStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot edit a request in status '${existing.status}'`,
          },
        });
      }

      const { rowVersion: _rv, ...updateData } = input;
      const updated = await tx.legalRequest.update({
        where: { id },
        data: updateData as Record<string, unknown>,
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'legal_request',
        objectId: id,
        correlationId: existing.requestNumber,
        beforeState: { title: existing.title, priority: existing.priority },
        afterState: { title: updated.title, priority: updated.priority },
      });

      return updated;
    });
  }

  // ─── State transition ────────────────────────────────────────────

  async transition(
    ctx: TenantContext,
    id: string,
    to: LegalRequestStatus,
    reason?: string,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.legalRequest.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Legal request not found' },
        });
      }

      const from = existing.status as LegalRequestStatus;
      if (from === to) {
        return existing; // idempotent
      }

      if (!isLegalRequestTransitionAllowed(from, to)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot transition legal request from '${from}' to '${to}'`,
            details: { from, to },
          },
        });
      }

      const updated = await tx.legalRequest.update({
        where: { id },
        data: { status: to as unknown as import('@prisma/client').$Enums.LegalRequestStatus },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'legal_request',
        objectId: id,
        correlationId: existing.requestNumber,
        beforeState: { status: from },
        afterState: { status: to, reason },
      });

      this.logger.log(`Legal request ${existing.requestNumber}: ${from} → ${to}`);
      return updated;
    });
  }

  // ─── Soft delete ─────────────────────────────────────────────────

  async softDelete(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.legalRequest.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Legal request not found' },
        });
      }

      // Only allow soft-delete of draft or cancelled requests
      const deletable: LegalRequestStatus[] = [
        LegalRequestStatus.draft,
        LegalRequestStatus.cancelled,
      ];
      if (!deletable.includes(existing.status as LegalRequestStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot delete a request in status '${existing.status}'`,
          },
        });
      }

      await tx.legalRequest.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: ctx.userId },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'delete',
        objectType: 'legal_request',
        objectId: id,
        correlationId: existing.requestNumber,
      });

      return { success: true, id };
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────

  /**
   * Generate the next per-org sequential request number.
   * Format: REQ-YYYY-NNNN (e.g. REQ-2026-0001).
   *
   * Uses a count of existing requests for this org as the sequence base.
   * The unique constraint on (organization_id, request_number) makes
   * collisions fail-safe — the INSERT will throw if two concurrent
   * writers race to the same number.
   */
  private async generateRequestNumber(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    organizationId: string,
  ): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `REQ-${year}-`;

    const count = await tx.legalRequest.count({
      where: { organizationId, requestNumber: { startsWith: prefix } },
    });

    const seq = (count + 1).toString().padStart(4, '0');
    return `${prefix}${seq}`;
  }
}
