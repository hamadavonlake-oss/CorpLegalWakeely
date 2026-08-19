import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantTransactionService } from '../database/tenant-transaction.service';
import { AuditService } from '../audit/audit.service';
import { StorageService, STORAGE_SERVICE } from '../storage/storage.interface';
import { ERROR_CODES } from '@glo/shared';
import type { PaginationDto, TenantContext } from '@glo/shared';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { Prisma } from '@prisma/client';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
    private readonly audit: AuditService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // Template CRUD
  // ═══════════════════════════════════════════════════════════════

  async create(
    ctx: TenantContext,
    input: {
      templateCode: string;
      name: string;
      nameEn?: string;
      description?: string;
      type: string;
      variablesSchema?: Record<string, unknown>;
      defaultValues?: Record<string, unknown>;
      countryCode?: string;
      locale?: string;
      filename: string;
      mimeType: string;
    },
    fileBuffer: Buffer,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      // Check for existing template with the same code
      const existing = await tx.template.findUnique({
        where: {
          organizationId_templateCode: {
            organizationId: ctx.organizationId,
            templateCode: input.templateCode,
          },
        },
      });
      if (existing) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `Template with code '${input.templateCode}' already exists`,
          },
        });
      }

      // Validate the DOCX file is a valid docxtemplater template by
      // attempting to parse it
      try {
        const zip = new PizZip(fileBuffer);
        // eslint-disable-next-line no-new
        new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
      } catch (err) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `Invalid DOCX template file: ${(err as Error).message}`,
          },
        });
      }

      // Upload the template binary to storage
      const storageKey = `templates/${ctx.organizationId}/${input.templateCode}/v1-${Date.now()}.docx`;
      const uploadResult = await this.storage.upload(storageKey, fileBuffer, input.mimeType);

      const template = await tx.template.create({
        data: {
          organizationId: ctx.organizationId,
          templateCode: input.templateCode,
          name: input.name,
          nameEn: input.nameEn,
          description: input.description,
          type: input.type,
          storageKey: uploadResult.storageKey,
          filename: input.filename,
          variablesSchema: input.variablesSchema
            ? (input.variablesSchema as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          defaultValues: input.defaultValues
            ? (input.defaultValues as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          countryCode: input.countryCode,
          locale: input.locale ?? 'ar',
          version: 1,
          isActive: true,
          createdBy: ctx.userId,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'create',
        objectType: 'template',
        objectId: template.id,
        correlationId: template.templateCode,
        afterState: { name: template.name, type: template.type },
      });

      this.logger.log(`Template created: ${template.templateCode}`);
      return template;
    });
  }

  async findOne(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const template = await tx.template.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        include: {
          clauses: { include: { clause: true } },
        },
      });
      if (!template) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Template not found' },
        });
      }
      return template;
    });
  }

  async findByCode(ctx: TenantContext, templateCode: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const template = await tx.template.findUnique({
        where: {
          organizationId_templateCode: {
            organizationId: ctx.organizationId,
            templateCode,
          },
        },
      });
      if (!template || template.deletedAt) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Template not found' },
        });
      }
      return template;
    });
  }

  async list(
    ctx: TenantContext,
    pagination: PaginationDto & { type?: string; isActive?: boolean },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const where = {
        organizationId: ctx.organizationId,
        deletedAt: null,
        ...(pagination.type ? { type: pagination.type } : {}),
        ...(pagination.isActive !== undefined ? { isActive: pagination.isActive } : {}),
      };

      const [rows, total] = await Promise.all([
        tx.template.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        tx.template.count({ where }),
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
      name?: string;
      nameEn?: string;
      description?: string;
      variablesSchema?: Record<string, unknown>;
      defaultValues?: Record<string, unknown>;
      countryCode?: string;
      locale?: string;
      isActive?: boolean;
      rowVersion?: number;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.template.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Template not found' },
        });
      }

      if (input.rowVersion !== undefined && input.rowVersion !== existing.rowVersion) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Template was modified by another user.',
            details: { expectedVersion: existing.rowVersion, providedVersion: input.rowVersion },
          },
        });
      }

      const updateData: Record<string, unknown> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.nameEn !== undefined) updateData.nameEn = input.nameEn;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.countryCode !== undefined) updateData.countryCode = input.countryCode;
      if (input.locale !== undefined) updateData.locale = input.locale;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      if (input.variablesSchema !== undefined) {
        updateData.variablesSchema = input.variablesSchema as Prisma.InputJsonValue;
      }
      if (input.defaultValues !== undefined) {
        updateData.defaultValues = input.defaultValues as Prisma.InputJsonValue;
      }

      const updated = await tx.template.update({
        where: { id },
        data: updateData,
      });

      return updated;
    });
  }

  async softDelete(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.template.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Template not found' },
        });
      }

      await tx.template.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: ctx.userId, isActive: false },
      });

      return { success: true };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Template Filling (docxtemplater)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Fill a template with the given variables using docxtemplater.
   *
   * Steps:
   * 1. Load the template DOCX from storage
   * 2. Merge provided variables with template defaultValues
   * 3. Resolve linked clauses (their body text fills placeholder variables)
   * 4. Render the DOCX with docxtemplater
   * 5. Upload the rendered DOCX as a new Document (with version 1)
   * 6. Return the new document's metadata + download URL
   *
   * The generated document is a new Document in the documents table,
   * linked to the contract/matter/request if provided.
   */
  async fillTemplate(
    ctx: TenantContext,
    templateId: string,
    input: {
      variables: Record<string, unknown>;
      contractId?: string;
      matterId?: string;
      legalRequestId?: string;
      outputFilename?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const template = await tx.template.findFirst({
        where: { id: templateId, organizationId: ctx.organizationId, deletedAt: null },
        include: {
          clauses: {
            include: { clause: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
      if (!template) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Template not found' },
        });
      }

      if (!template.isActive) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Template is not active',
          },
        });
      }

      // 1. Download the template binary
      const templateBuffer = await this.storage.download(template.storageKey);
      if (!templateBuffer) {
        throw new NotFoundException({
          success: false,
          error: {
            code: ERROR_CODES.NOT_FOUND,
            message: 'Template file not found in storage',
          },
        });
      }

      // 2. Merge default values + provided variables + clause bodies
      const defaultValues = (template.defaultValues as Record<string, unknown> | null) ?? {};
      const clauseVariables: Record<string, unknown> = {};
      for (const link of template.clauses) {
        if (link.clause.isActive) {
          clauseVariables[link.placeholderName] = link.clause.bodyText;
        }
      }

      const mergedVariables: Record<string, unknown> = {
        ...defaultValues,
        ...clauseVariables,
        ...input.variables,
      };

      // 3. Render the DOCX
      let renderedBuffer: Buffer;
      try {
        const zip = new PizZip(templateBuffer);
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          nullGetter: () => '', // Replace undefined variables with empty string
        });
        doc.render(mergedVariables);
        renderedBuffer = doc.getZip().generate({ type: 'nodebuffer' });
      } catch (err) {
        this.logger.error(`Template render failed: ${(err as Error).message}`);
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `Template rendering failed: ${(err as Error).message}`,
          },
        });
      }

      // 4. Create a new Document for the rendered output
      const documentNumber = await this.generateDocumentNumber(tx, ctx.organizationId);
      const document = await tx.document.create({
        data: {
          organizationId: ctx.organizationId,
          contractId: input.contractId ?? null,
          matterId: input.matterId ?? null,
          legalRequestId: input.legalRequestId ?? null,
          documentNumber,
          title: input.outputFilename ?? template.name,
          description: `Generated from template ${template.templateCode}`,
          type: 'contract_draft',
          status: 'draft' as import('@prisma/client').$Enums.DocumentStatus,
          classification: 'internal' as import('@prisma/client').$Enums.ClassificationLevel,
          uploadedBy: ctx.userId,
        },
      });

      // 5. Upload the rendered DOCX as version 1
      const storageKey = `documents/${ctx.organizationId}/${document.id}/v1-${Date.now()}.docx`;
      const uploadResult = await this.storage.upload(
        storageKey,
        renderedBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );

      await tx.documentVersion.create({
        data: {
          documentId: document.id,
          organizationId: ctx.organizationId,
          versionNumber: 1,
          storageKey: uploadResult.storageKey,
          filename: `${input.outputFilename ?? template.templateCode}.docx`,
          mimeType: uploadResult.mimeType,
          sizeBytes: uploadResult.sizeBytes,
          contentHash: uploadResult.contentHash,
          uploadedBy: ctx.userId,
        },
      });

      // Update parent document metadata
      await tx.document.update({
        where: { id: document.id },
        data: {
          mimeType: uploadResult.mimeType,
          sizeBytes: uploadResult.sizeBytes,
          contentHash: uploadResult.contentHash,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'create',
        objectType: 'document',
        objectId: document.id,
        correlationId: document.documentNumber,
        afterState: {
          title: document.title,
          sourceTemplateId: templateId,
          sourceTemplateCode: template.templateCode,
        },
      });

      // Generate a download URL
      const downloadUrl = await this.storage.getSignedDownloadUrl(uploadResult.storageKey);

      this.logger.log(
        `Template ${template.templateCode} filled → document ${document.documentNumber}`,
      );

      return {
        document,
        downloadUrl,
        filename: `${input.outputFilename ?? template.templateCode}.docx`,
        sizeBytes: uploadResult.sizeBytes,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Template-Clause links
  // ═══════════════════════════════════════════════════════════════

  async linkClause(
    ctx: TenantContext,
    templateId: string,
    input: { clauseId: string; placeholderName: string; sortOrder?: number },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const template = await tx.template.findFirst({
        where: { id: templateId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, templateCode: true },
      });
      if (!template) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Template not found' },
        });
      }

      const clause = await tx.clause.findFirst({
        where: { id: input.clauseId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, code: true },
      });
      if (!clause) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Clause not found' },
        });
      }

      // Check for existing link with the same placeholder
      const existing = await tx.templateClause.findUnique({
        where: {
          templateId_clauseId_placeholderName: {
            templateId,
            clauseId: input.clauseId,
            placeholderName: input.placeholderName,
          },
        },
      });
      if (existing) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Clause is already linked to this template with the same placeholder',
          },
        });
      }

      const link = await tx.templateClause.create({
        data: {
          templateId,
          clauseId: input.clauseId,
          organizationId: ctx.organizationId,
          placeholderName: input.placeholderName,
          sortOrder: input.sortOrder ?? 0,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'template',
        objectId: templateId,
        correlationId: template.templateCode,
        afterState: { linkedClauseId: input.clauseId, placeholderName: input.placeholderName },
      });

      return link;
    });
  }

  async unlinkClause(
    ctx: TenantContext,
    templateId: string,
    clauseId: string,
    placeholderName: string,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const link = await tx.templateClause.findUnique({
        where: {
          templateId_clauseId_placeholderName: {
            templateId,
            clauseId,
            placeholderName,
          },
        },
      });
      if (!link) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Clause link not found' },
        });
      }

      await tx.templateClause.delete({ where: { id: link.id } });

      return { success: true };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  private async generateDocumentNumber(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    organizationId: string,
  ): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `DOC-${year}-`;
    const count = await tx.document.count({
      where: { organizationId, documentNumber: { startsWith: prefix } },
    });
    const seq = (count + 1).toString().padStart(4, '0');
    return `${prefix}${seq}`;
  }
}
