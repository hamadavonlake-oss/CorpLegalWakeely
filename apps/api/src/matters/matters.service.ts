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
import { ERROR_CODES, MatterStatus, LegalRequestStatus } from '@glo/shared';
import type { PaginationDto, TenantContext } from '@glo/shared';
import { isMatterTransitionAllowed } from './matter.state-machine';

@Injectable()
export class MattersService {
  private readonly logger = new Logger(MattersService.name);

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
      entityId?: string;
      assignedTo?: string;
      responsibleUser?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
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

      const matterNumber = await this.generateMatterNumber(tx, ctx.organizationId);

      const matter = await tx.matter.create({
        data: {
          organizationId: ctx.organizationId,
          entityId: input.entityId ?? null,
          matterNumber,
          title: input.title,
          titleEn: input.titleEn,
          description: input.description,
          type: input.type,
          status: MatterStatus.open,
          priority: input.priority ?? 'medium',
          assignedTo: input.assignedTo ?? null,
          responsibleUser: input.responsibleUser ?? null,
          classification: 'internal',
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'create',
        objectType: 'matter',
        objectId: matter.id,
        correlationId: matter.matterNumber,
        afterState: {
          title: matter.title,
          status: matter.status,
          type: matter.type,
          priority: matter.priority,
        },
      });

      this.logger.log(`Matter created: ${matter.matterNumber} by ${ctx.userId}`);
      return matter;
    });
  }

  // ─── Read ─────────────────────────────────────────────────────────

  async findOne(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const matter = await tx.matter.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        include: {
          entity: true,
          requestLinks: { include: { request: true } },
        },
      });
      if (!matter) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Matter not found' },
        });
      }
      return matter;
    });
  }

  async list(
    ctx: TenantContext,
    pagination: PaginationDto & { status?: MatterStatus },
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
        tx.matter.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        tx.matter.count({ where }),
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
      responsibleUser?: string;
      rowVersion?: number;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.matter.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Matter not found' },
        });
      }

      if (input.rowVersion !== undefined && input.rowVersion !== existing.rowVersion) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Matter was modified by another user. Please refresh and try again.',
            details: { expectedVersion: existing.rowVersion, providedVersion: input.rowVersion },
          },
        });
      }

      // Cannot edit archived or cancelled matters
      const frozen: MatterStatus[] = [MatterStatus.archived, MatterStatus.cancelled];
      if (frozen.includes(existing.status as MatterStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot edit a matter in status '${existing.status}'`,
          },
        });
      }

      const { rowVersion: _rv, ...updateData } = input;
      const updated = await tx.matter.update({
        where: { id },
        data: updateData as Record<string, unknown>,
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'matter',
        objectId: id,
        correlationId: existing.matterNumber,
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
    to: MatterStatus,
    reason?: string,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.matter.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Matter not found' },
        });
      }

      const from = existing.status as MatterStatus;
      if (from === to) {
        return existing;
      }

      if (!isMatterTransitionAllowed(from, to)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot transition matter from '${from}' to '${to}'`,
            details: { from, to },
          },
        });
      }

      const updated = await tx.matter.update({
        where: { id },
        data: { status: to as unknown as import('@prisma/client').$Enums.MatterStatus },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'matter',
        objectId: id,
        correlationId: existing.matterNumber,
        beforeState: { status: from },
        afterState: { status: to, reason },
      });

      this.logger.log(`Matter ${existing.matterNumber}: ${from} → ${to}`);
      return updated;
    });
  }

  // ─── Request ⇄ Matter linking ────────────────────────────────────

  async linkRequest(ctx: TenantContext, matterId: string, requestId: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const matter = await tx.matter.findFirst({
        where: { id: matterId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, matterNumber: true },
      });
      if (!matter) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Matter not found' },
        });
      }

      const request = await tx.legalRequest.findFirst({
        where: { id: requestId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, requestNumber: true, status: true },
      });
      if (!request) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Legal request not found' },
        });
      }

      // Prevent duplicate links (the unique constraint would also catch this)
      const existing = await tx.legalRequestMatterLink.findUnique({
        where: { requestId_matterId: { requestId, matterId } },
      });
      if (existing) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Request is already linked to this matter',
          },
        });
      }

      const link = await tx.legalRequestMatterLink.create({
        data: { requestId, matterId, linkedBy: ctx.userId },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'matter',
        objectId: matterId,
        correlationId: matter.matterNumber,
        afterState: { linkedRequestId: requestId, linkedRequestNumber: request.requestNumber },
      });

      return link;
    });
  }

  async unlinkRequest(ctx: TenantContext, matterId: string, requestId: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const link = await tx.legalRequestMatterLink.findUnique({
        where: { requestId_matterId: { requestId, matterId } },
      });
      if (!link) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Link not found' },
        });
      }

      // Verify the matter belongs to this tenant (defence in depth — RLS should already catch this)
      const matter = await tx.matter.findFirst({
        where: { id: matterId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!matter) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Matter not found' },
        });
      }

      await tx.legalRequestMatterLink.delete({
        where: { id: link.id },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'matter',
        objectId: matterId,
        correlationId: matterId,
        afterState: { unlinkedRequestId: requestId },
      });

      return { success: true };
    });
  }

  // ─── Convert request → matter (one-shot atomic action) ───────────

  /**
   * Convert a legal request into a new matter. Atomically:
   *   1. Validates the request exists and is in `in_progress` or `triaged`
   *   2. Creates a new matter seeded from the request
   *   3. Links the request to the matter
   *   4. Transitions the request to `converted_to_matter`
   *
   * All within a single tenant-scoped transaction.
   */
  async convertRequestToMatter(
    ctx: TenantContext,
    requestId: string,
    input: {
      title?: string;
      titleEn?: string;
      description?: string;
      type?: string;
      priority?: string;
      entityId?: string;
      assignedTo?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const request = await tx.legalRequest.findFirst({
        where: { id: requestId, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!request) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Legal request not found' },
        });
      }

      const allowedSourceStatuses: LegalRequestStatus[] = [
        LegalRequestStatus.in_progress,
        LegalRequestStatus.triaged,
      ];
      if (!allowedSourceStatuses.includes(request.status as LegalRequestStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot convert a request in status '${request.status}' to a matter`,
          },
        });
      }

      const matterNumber = await this.generateMatterNumber(tx, ctx.organizationId);

      const matter = await tx.matter.create({
        data: {
          organizationId: ctx.organizationId,
          entityId: input.entityId ?? request.entityId ?? null,
          matterNumber,
          title: input.title ?? request.title,
          titleEn: input.titleEn ?? request.titleEn ?? null,
          description: input.description ?? request.description,
          type: input.type ?? request.type,
          status: MatterStatus.in_progress,
          priority: input.priority ?? request.priority ?? 'medium',
          assignedTo: input.assignedTo ?? request.assignedTo ?? null,
          classification: 'internal',
        },
      });

      await tx.legalRequestMatterLink.create({
        data: { requestId: request.id, matterId: matter.id, linkedBy: ctx.userId },
      });

      // Transition the request to converted_to_matter
      await tx.legalRequest.update({
        where: { id: request.id },
        data: {
          status:
            LegalRequestStatus.converted_to_matter as unknown as import('@prisma/client').$Enums.LegalRequestStatus,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'create',
        objectType: 'matter',
        objectId: matter.id,
        correlationId: matter.matterNumber,
        afterState: {
          title: matter.title,
          status: matter.status,
          sourceRequestId: request.id,
          sourceRequestNumber: request.requestNumber,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'legal_request',
        objectId: request.id,
        correlationId: request.requestNumber,
        beforeState: { status: request.status },
        afterState: { status: LegalRequestStatus.converted_to_matter, matterId: matter.id },
      });

      this.logger.log(
        `Converted request ${request.requestNumber} → matter ${matter.matterNumber}`,
      );

      return { matter, requestId: request.id };
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private async generateMatterNumber(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    organizationId: string,
  ): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `MTR-${year}-`;
    const count = await tx.matter.count({
      where: { organizationId, matterNumber: { startsWith: prefix } },
    });
    const seq = (count + 1).toString().padStart(4, '0');
    return `${prefix}${seq}`;
  }
}
