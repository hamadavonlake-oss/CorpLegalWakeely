import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import { TenantTransactionService } from '../database/tenant-transaction.service';
import { AuditService } from '../audit/audit.service';
import { ERROR_CODES, ConflictCheckStatus } from '@glo/shared';
import type { PaginationDto, TenantContext } from '@glo/shared';
import { isConflictCheckTransitionAllowed } from './conflict-check.state-machine';

/**
 * Conflict Checks Service — administrative-only (no AI/OCR, per Rule 1).
 *
 * Records a manual conflict-of-interest check against a Matter (Phase 2)
 * or Contract (Phase 3 — not yet wired). Names are stored as a JSON array
 * of { name, name_en } pairs to support Arabic + English search terms.
 */
@Injectable()
export class ConflictChecksService {
  private readonly logger = new Logger(ConflictChecksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
    private readonly audit: AuditService,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────

  async create(
    ctx: TenantContext,
    input: {
      parentType: 'matter';
      parentId: string;
      names: { name?: string; nameEn?: string }[];
      registrationNumbers?: string[];
      notes?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      // Validate parent (matter) belongs to this org
      if (input.parentType === 'matter') {
        const matter = await tx.matter.findFirst({
          where: { id: input.parentId, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true, matterNumber: true },
        });
        if (!matter) {
          throw new NotFoundException({
            success: false,
            error: { code: ERROR_CODES.NOT_FOUND, message: 'Matter not found in this organization' },
          });
        }
      } else {
        // Phase 3 will add contract support
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `Unsupported parent type: ${input.parentType}. Only 'matter' is supported in Phase 2.`,
          },
        });
      }

      // Enforce uniqueness: one check per parent
      const existing = await tx.conflictCheck.findUnique({
        where: {
          parentType_parentId: {
            parentType: input.parentType,
            parentId: input.parentId,
          },
        },
      });
      if (existing) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'A conflict check already exists for this matter',
          },
        });
      }

      // Validate that at least one name is provided
      if (!input.names || input.names.length === 0) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'At least one name (Arabic or English) is required',
          },
        });
      }

      const check = await tx.conflictCheck.create({
        data: {
          organizationId: ctx.organizationId,
          parentType: input.parentType,
          parentId: input.parentId,
          status: ConflictCheckStatus.not_checked,
          names: input.names as unknown as Prisma.InputJsonValue,
          registrationNumbers: input.registrationNumbers
            ? (input.registrationNumbers as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          notes: input.notes,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'create',
        objectType: 'conflict_check',
        objectId: check.id,
        correlationId: `${input.parentType}:${input.parentId}`,
        afterState: {
          parentType: input.parentType,
          parentId: input.parentId,
          status: check.status,
          nameCount: input.names.length,
        },
      });

      this.logger.log(
        `Conflict check created: id=${check.id} parent=${input.parentType}:${input.parentId}`,
      );
      return check;
    });
  }

  // ─── Read ─────────────────────────────────────────────────────────

  async findOne(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const check = await tx.conflictCheck.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!check) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Conflict check not found' },
        });
      }
      return check;
    });
  }

  async findByParent(
    ctx: TenantContext,
    parentType: 'matter',
    parentId: string,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const check = await tx.conflictCheck.findFirst({
        where: {
          parentType,
          parentId,
          organizationId: ctx.organizationId,
          deletedAt: null,
        },
      });
      if (!check) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Conflict check not found for this parent' },
        });
      }
      return check;
    });
  }

  async list(
    ctx: TenantContext,
    pagination: PaginationDto & { status?: ConflictCheckStatus },
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
        tx.conflictCheck.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        tx.conflictCheck.count({ where }),
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
      names?: { name?: string; nameEn?: string }[];
      registrationNumbers?: string[];
      notes?: string;
      resultSummary?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.conflictCheck.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Conflict check not found' },
        });
      }

      // Cannot edit a blocked check (must reset to not_checked first)
      if (existing.status === ConflictCheckStatus.blocked) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: 'Cannot edit a blocked conflict check. Reset to not_checked first.',
          },
        });
      }

      const updateData: Record<string, unknown> = {};
      if (input.names !== undefined) {
        updateData.names = input.names as unknown as Prisma.InputJsonValue;
      }
      if (input.registrationNumbers !== undefined) {
        updateData.registrationNumbers =
          input.registrationNumbers.length > 0
            ? (input.registrationNumbers as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull;
      }
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.resultSummary !== undefined) updateData.resultSummary = input.resultSummary;

      const updated = await tx.conflictCheck.update({
        where: { id },
        data: updateData,
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'conflict_check',
        objectId: id,
        correlationId: `${existing.parentType}:${existing.parentId}`,
        beforeState: { notes: existing.notes },
        afterState: { notes: updated.notes, resultSummary: updated.resultSummary },
      });

      return updated;
    });
  }

  // ─── State transition ────────────────────────────────────────────

  async transition(
    ctx: TenantContext,
    id: string,
    to: ConflictCheckStatus,
    options?: { reason?: string; resultSummary?: string },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.conflictCheck.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Conflict check not found' },
        });
      }

      const from = existing.status as ConflictCheckStatus;
      if (from === to) {
        return existing; // idempotent
      }

      if (!isConflictCheckTransitionAllowed(from, to)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot transition conflict check from '${from}' to '${to}'`,
            details: { from, to },
          },
        });
      }

      // Transitioning away from not_checked records the check as performed
      const updateData: Record<string, unknown> = {
        status: to as unknown as import('@prisma/client').$Enums.ConflictCheckStatus,
      };
      if (to !== ConflictCheckStatus.not_checked && !existing.checkedAt) {
        updateData.checkedAt = new Date();
        updateData.checkedBy = ctx.userId;
      }
      // Reset path: if going back to not_checked, clear the check metadata
      if (to === ConflictCheckStatus.not_checked) {
        updateData.checkedAt = null;
        updateData.checkedBy = null;
        updateData.resultSummary = null;
      } else if (options?.resultSummary !== undefined) {
        updateData.resultSummary = options.resultSummary;
      }

      const updated = await tx.conflictCheck.update({
        where: { id },
        data: updateData,
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'conflict_check',
        objectId: id,
        correlationId: `${existing.parentType}:${existing.parentId}`,
        beforeState: { status: from },
        afterState: { status: to, reason: options?.reason, resultSummary: updated.resultSummary },
      });

      this.logger.log(`Conflict check ${id}: ${from} → ${to}`);
      return updated;
    });
  }

  // ─── Soft delete ─────────────────────────────────────────────────

  async softDelete(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.conflictCheck.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Conflict check not found' },
        });
      }

      // Do NOT allow deletion of an active check (blocked or possible_match)
      const active: ConflictCheckStatus[] = [
        ConflictCheckStatus.blocked,
        ConflictCheckStatus.possible_match,
        ConflictCheckStatus.requires_review,
      ];
      if (active.includes(existing.status as ConflictCheckStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot delete a conflict check in status '${existing.status}'`,
          },
        });
      }

      await tx.conflictCheck.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: ctx.userId },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'delete',
        objectType: 'conflict_check',
        objectId: id,
        correlationId: `${existing.parentType}:${existing.parentId}`,
      });

      return { success: true, id };
    });
  }
}
