import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import { TenantTransactionService } from '../database/tenant-transaction.service';
import { AuditService } from '../audit/audit.service';
import { ERROR_CODES } from '@glo/shared';
import type { PaginationDto, TenantContext } from '@glo/shared';

@Injectable()
export class ClausesService {
  private readonly logger = new Logger(ClausesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
    private readonly audit: AuditService,
  ) {}

  async create(
    ctx: TenantContext,
    input: {
      code: string;
      title: string;
      titleEn?: string;
      category: string;
      bodyText: string;
      bodyTextEn?: string;
      variables?: Record<string, unknown>;
      countryCode?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      // Check for existing clause with the same code
      const existing = await tx.clause.findUnique({
        where: {
          organizationId_code: {
            organizationId: ctx.organizationId,
            code: input.code,
          },
        },
      });
      if (existing) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `Clause with code '${input.code}' already exists`,
          },
        });
      }

      const clause = await tx.clause.create({
        data: {
          organizationId: ctx.organizationId,
          code: input.code,
          title: input.title,
          titleEn: input.titleEn,
          category: input.category,
          bodyText: input.bodyText,
          bodyTextEn: input.bodyTextEn,
          variables: input.variables
            ? (input.variables as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          countryCode: input.countryCode,
          isActive: true,
          version: 1,
          createdBy: ctx.userId,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'create',
        objectType: 'clause',
        objectId: clause.id,
        correlationId: clause.code,
        afterState: { title: clause.title, category: clause.category },
      });

      this.logger.log(`Clause created: ${clause.code}`);
      return clause;
    });
  }

  async findOne(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const clause = await tx.clause.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!clause) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Clause not found' },
        });
      }
      return clause;
    });
  }

  async findByCode(ctx: TenantContext, code: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const clause = await tx.clause.findUnique({
        where: {
          organizationId_code: {
            organizationId: ctx.organizationId,
            code,
          },
        },
      });
      if (!clause || clause.deletedAt) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Clause not found' },
        });
      }
      return clause;
    });
  }

  async list(
    ctx: TenantContext,
    pagination: PaginationDto & {
      category?: string;
      isActive?: boolean;
      countryCode?: string;
    },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const where = {
        organizationId: ctx.organizationId,
        deletedAt: null,
        ...(pagination.category ? { category: pagination.category } : {}),
        ...(pagination.isActive !== undefined ? { isActive: pagination.isActive } : {}),
        ...(pagination.countryCode ? { countryCode: pagination.countryCode } : {}),
      };

      const [rows, total] = await Promise.all([
        tx.clause.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { category: 'asc' },
        }),
        tx.clause.count({ where }),
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
      category?: string;
      bodyText?: string;
      bodyTextEn?: string;
      variables?: Record<string, unknown>;
      countryCode?: string;
      isActive?: boolean;
      rowVersion?: number;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.clause.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Clause not found' },
        });
      }

      if (input.rowVersion !== undefined && input.rowVersion !== existing.rowVersion) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Clause was modified by another user.',
            details: { expectedVersion: existing.rowVersion, providedVersion: input.rowVersion },
          },
        });
      }

      // Increment version if body text is changing
      const shouldIncrementVersion =
        input.bodyText !== undefined && input.bodyText !== existing.bodyText;

      const updateData: Record<string, unknown> = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.titleEn !== undefined) updateData.titleEn = input.titleEn;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.bodyText !== undefined) updateData.bodyText = input.bodyText;
      if (input.bodyTextEn !== undefined) updateData.bodyTextEn = input.bodyTextEn;
      if (input.countryCode !== undefined) updateData.countryCode = input.countryCode;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      if (input.variables !== undefined) {
        updateData.variables = input.variables as Prisma.InputJsonValue;
      }
      if (shouldIncrementVersion) {
        updateData.version = existing.version + 1;
      }

      const updated = await tx.clause.update({
        where: { id },
        data: updateData,
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'clause',
        objectId: id,
        correlationId: existing.code,
        beforeState: { title: existing.title, version: existing.version },
        afterState: { title: updated.title, version: updated.version },
      });

      return updated;
    });
  }

  async softDelete(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.clause.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Clause not found' },
        });
      }

      await tx.clause.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: ctx.userId, isActive: false },
      });

      return { success: true };
    });
  }
}
