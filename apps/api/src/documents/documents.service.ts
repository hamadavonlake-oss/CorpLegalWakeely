import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import { TenantTransactionService } from '../database/tenant-transaction.service';
import { AuditService } from '../audit/audit.service';
import { StorageService, STORAGE_SERVICE } from '../storage/storage.interface';
import { ERROR_CODES, DocumentStatus, VirusScanStatus } from '@glo/shared';
import type { PaginationDto, TenantContext } from '@glo/shared';
import {
  isDocumentTransitionAllowed,
  DOCUMENT_EDITABLE_STATES,
} from './document.state-machine';
import { Inject } from '@nestjs/common';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
    private readonly audit: AuditService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // Document CRUD
  // ═══════════════════════════════════════════════════════════════

  async create(
    ctx: TenantContext,
    input: {
      title: string;
      titleEn?: string;
      description?: string;
      type: string;
      contractId?: string;
      matterId?: string;
      legalRequestId?: string;
      classification?: string;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      // Validate contract belongs to org (if provided)
      if (input.contractId) {
        const contract = await tx.contract.findFirst({
          where: { id: input.contractId, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true, contractNumber: true },
        });
        if (!contract) {
          throw new NotFoundException({
            success: false,
            error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract not found' },
          });
        }
      }

      // Validate matter belongs to org
      if (input.matterId) {
        const matter = await tx.matter.findFirst({
          where: { id: input.matterId, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true },
        });
        if (!matter) {
          throw new NotFoundException({
            success: false,
            error: { code: ERROR_CODES.NOT_FOUND, message: 'Matter not found' },
          });
        }
      }

      // Validate legal request belongs to org
      if (input.legalRequestId) {
        const req = await tx.legalRequest.findFirst({
          where: { id: input.legalRequestId, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true },
        });
        if (!req) {
          throw new NotFoundException({
            success: false,
            error: { code: ERROR_CODES.NOT_FOUND, message: 'Legal request not found' },
          });
        }
      }

      const documentNumber = await this.generateDocumentNumber(tx, ctx.organizationId);

      const document = await tx.document.create({
        data: {
          organizationId: ctx.organizationId,
          contractId: input.contractId ?? null,
          matterId: input.matterId ?? null,
          legalRequestId: input.legalRequestId ?? null,
          documentNumber,
          title: input.title,
          titleEn: input.titleEn,
          description: input.description,
          type: input.type,
          status: DocumentStatus.draft as unknown as import('@prisma/client').$Enums.DocumentStatus,
          classification: (input.classification ?? 'internal') as import('@prisma/client').$Enums.ClassificationLevel,
          uploadedBy: ctx.userId,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'create',
        objectType: 'document',
        objectId: document.id,
        correlationId: document.documentNumber,
        afterState: { title: document.title, type: document.type, status: document.status },
      });

      this.logger.log(`Document created: ${document.documentNumber} by ${ctx.userId}`);
      return document;
    });
  }

  async findOne(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const document = await tx.document.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        include: {
          contract: { select: { id: true, contractNumber: true, title: true } },
          matter: { select: { id: true, matterNumber: true, title: true } },
          legalRequest: { select: { id: true, requestNumber: true, title: true } },
          versions: { orderBy: { versionNumber: 'desc' } },
          contractDocumentLinks: { include: { contract: true } },
        },
      });
      if (!document) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document not found' },
        });
      }
      return document;
    });
  }

  async list(
    ctx: TenantContext,
    pagination: PaginationDto & {
      status?: DocumentStatus;
      contractId?: string;
      matterId?: string;
      legalRequestId?: string;
      type?: string;
    },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const where = {
        organizationId: ctx.organizationId,
        deletedAt: null,
        ...(pagination.status ? { status: pagination.status } : {}),
        ...(pagination.contractId ? { contractId: pagination.contractId } : {}),
        ...(pagination.matterId ? { matterId: pagination.matterId } : {}),
        ...(pagination.legalRequestId ? { legalRequestId: pagination.legalRequestId } : {}),
        ...(pagination.type ? { type: pagination.type } : {}),
      };

      const [rows, total] = await Promise.all([
        tx.document.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        tx.document.count({ where }),
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
      classification?: string;
      rowVersion?: number;
    },
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.document.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document not found' },
        });
      }

      if (input.rowVersion !== undefined && input.rowVersion !== existing.rowVersion) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Document was modified by another user. Please refresh and try again.',
            details: { expectedVersion: existing.rowVersion, providedVersion: input.rowVersion },
          },
        });
      }

      // Only allow metadata edits while in an editable state
      // (Content changes are made via new versions, not via update)
      if (!DOCUMENT_EDITABLE_STATES.has(existing.status as DocumentStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot edit a document in status '${existing.status}'`,
          },
        });
      }

      const { rowVersion: _rv, ...updateData } = input;
      const updated = await tx.document.update({
        where: { id },
        data: updateData as Record<string, unknown>,
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'document',
        objectId: id,
        correlationId: existing.documentNumber,
        beforeState: { title: existing.title },
        afterState: { title: updated.title },
      });

      return updated;
    });
  }

  async transition(
    ctx: TenantContext,
    id: string,
    to: DocumentStatus,
    reason?: string,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.document.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document not found' },
        });
      }

      const from = existing.status as DocumentStatus;
      if (from === to) return existing; // idempotent

      if (!isDocumentTransitionAllowed(from, to)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_STATE_TRANSITION,
            message: `Cannot transition document from '${from}' to '${to}'`,
            details: { from, to },
          },
        });
      }

      const updateData: Record<string, unknown> = {
        status: to as unknown as import('@prisma/client').$Enums.DocumentStatus,
      };

      // When transitioning to approved, record approver + timestamp
      if (to === DocumentStatus.approved) {
        updateData.approvedBy = ctx.userId;
        updateData.approvedAt = new Date();
      }

      const updated = await tx.document.update({
        where: { id },
        data: updateData,
      });

      // If approved, also mark the latest version as approved (immutable)
      if (to === DocumentStatus.approved) {
        await tx.documentVersion.updateMany({
          where: {
            documentId: id,
            versionNumber: existing.currentVersion,
          },
          data: {
            approvedBy: ctx.userId,
            approvedAt: new Date(),
            virusScanStatus: VirusScanStatus.clean as unknown as import('@prisma/client').$Enums.VirusScanStatus,
          },
        });
      }

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: to === DocumentStatus.approved ? 'approve' : 'update',
        objectType: 'document',
        objectId: id,
        correlationId: existing.documentNumber,
        beforeState: { status: from },
        afterState: { status: to, reason },
      });

      this.logger.log(`Document ${existing.documentNumber}: ${from} → ${to}`);
      return updated;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Document Versions (immutable)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Upload a new version of the document. Creates a new DocumentVersion
   * row + uploads the binary to storage. The previous version is NOT
   * modified — versions are immutable.
   *
   * Per Rule 12: Approved documents cannot have new versions added.
   * A new Document must be created instead.
   */
  async uploadVersion(
    ctx: TenantContext,
    documentId: string,
    input: {
      filename: string;
      mimeType: string;
      changeSummary?: string;
    },
    buffer: Buffer,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!document) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document not found' },
        });
      }

      // Cannot add versions to approved/exported/filed/archived documents
      if (!DOCUMENT_EDITABLE_STATES.has(document.status as DocumentStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.DOCUMENT_IMMUTABLE,
            message: `Cannot add a version to a document in status '${document.status}'. Create a new document instead.`,
          },
        });
      }

      const newVersionNumber = document.currentVersion + 1;
      const storageKey = `documents/${ctx.organizationId}/${documentId}/v${newVersionNumber}-${Date.now()}`;

      // Upload binary to storage
      const uploadResult = await this.storage.upload(storageKey, buffer, input.mimeType);

      // Create the version row
      const version = await tx.documentVersion.create({
        data: {
          documentId,
          organizationId: ctx.organizationId,
          versionNumber: newVersionNumber,
          storageKey: uploadResult.storageKey,
          filename: input.filename,
          mimeType: uploadResult.mimeType,
          sizeBytes: uploadResult.sizeBytes,
          contentHash: uploadResult.contentHash,
          changeSummary: input.changeSummary,
          uploadedBy: ctx.userId,
        },
      });

      // Update the parent document's metadata
      await tx.document.update({
        where: { id: documentId },
        data: {
          currentVersion: newVersionNumber,
          mimeType: uploadResult.mimeType,
          sizeBytes: uploadResult.sizeBytes,
          contentHash: uploadResult.contentHash,
          rowVersion: { increment: 1 },
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'upload',
        objectType: 'document',
        objectId: documentId,
        correlationId: document.documentNumber,
        afterState: {
          version: newVersionNumber,
          sizeBytes: uploadResult.sizeBytes,
          contentHash: uploadResult.contentHash,
          changeSummary: input.changeSummary,
        },
      });

      this.logger.log(
        `Document version uploaded: ${document.documentNumber} v${newVersionNumber} ` +
          `(${uploadResult.sizeBytes} bytes, hash=${uploadResult.contentHash.slice(0, 8)}…)`,
      );
      return version;
    });
  }

  /**
   * List all versions of a document, newest first.
   */
  async listVersions(ctx: TenantContext, documentId: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, documentNumber: true },
      });
      if (!document) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document not found' },
        });
      }

      return tx.documentVersion.findMany({
        where: { documentId },
        orderBy: { versionNumber: 'desc' },
      });
    });
  }

  /**
   * Get a specific version of a document.
   */
  async getVersion(ctx: TenantContext, documentId: string, versionNumber: number) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const version = await tx.documentVersion.findFirst({
        where: {
          documentId,
          organizationId: ctx.organizationId,
          versionNumber,
        },
      });
      if (!version) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document version not found' },
        });
      }
      return version;
    });
  }

  /**
   * Generate a signed download URL for a specific version's binary.
   * Returns a short-lived URL the client can use to download directly
   * from S3/MinIO without proxying through the API.
   */
  async getDownloadUrl(
    ctx: TenantContext,
    documentId: string,
    versionNumber?: number,
  ): Promise<{ url: string; filename: string; mimeType: string; sizeBytes: number }> {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!document) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document not found' },
        });
      }

      const targetVersion = versionNumber ?? document.currentVersion;
      const version = await tx.documentVersion.findFirst({
        where: { documentId, organizationId: ctx.organizationId, versionNumber: targetVersion },
      });
      if (!version) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: `Version ${targetVersion} not found` },
        });
      }

      const url = await this.storage.getSignedDownloadUrl(version.storageKey);

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'download',
        objectType: 'document',
        objectId: documentId,
        correlationId: `${document.documentNumber}:v${targetVersion}`,
      });

      return {
        url,
        filename: version.filename,
        mimeType: version.mimeType,
        sizeBytes: version.sizeBytes,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Legal Hold & Retention (Rule 10)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Toggle Legal Hold on a document. When Legal Hold is active, the
   * document cannot be permanently deleted (Rule 10).
   */
  async setLegalHold(
    ctx: TenantContext,
    id: string,
    legalHold: boolean,
    reason?: string,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.document.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document not found' },
        });
      }

      if (existing.legalHold === legalHold) {
        return existing; // idempotent
      }

      const updated = await tx.document.update({
        where: { id },
        data: { legalHold },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'legal_hold',
        objectType: 'document',
        objectId: id,
        correlationId: existing.documentNumber,
        beforeState: { legalHold: existing.legalHold },
        afterState: { legalHold, reason },
      });

      this.logger.log(`Legal hold ${legalHold ? 'ENABLED' : 'DISABLED'} on document ${existing.documentNumber}`);
      return updated;
    });
  }

  /**
   * Set a retention policy on a document. After `retentionUntil`, the
   * document can be permanently deleted (if not under Legal Hold).
   */
  async setRetention(
    ctx: TenantContext,
    id: string,
    retentionUntil?: string,
    reason?: string,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.document.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document not found' },
        });
      }

      const updated = await tx.document.update({
        where: { id },
        data: {
          retentionUntil: retentionUntil ? new Date(retentionUntil) : null,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'retention',
        objectType: 'document',
        objectId: id,
        correlationId: existing.documentNumber,
        beforeState: { retentionUntil: existing.retentionUntil },
        afterState: { retentionUntil: updated.retentionUntil, reason },
      });

      return updated;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Soft Delete (respects Legal Hold per Rule 10)
  // ═══════════════════════════════════════════════════════════════

  async softDelete(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.document.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document not found' },
        });
      }

      // Legal Hold prevents permanent deletion (Rule 10)
      // Soft delete is allowed (sets deletedAt), but the binary stays in storage
      if (existing.legalHold) {
        throw new ForbiddenException({
          success: false,
          error: {
            code: ERROR_CODES.LEGAL_HOLD_ACTIVE,
            message: 'Cannot delete a document under Legal Hold. Remove the hold first.',
          },
        });
      }

      await tx.document.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: ctx.userId },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'delete',
        objectType: 'document',
        objectId: id,
        correlationId: existing.documentNumber,
      });

      return { success: true, id };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Contract Document Links
  // ═══════════════════════════════════════════════════════════════

  async linkToContract(
    ctx: TenantContext,
    contractId: string,
    documentId: string,
    linkType: 'source' | 'signed_copy' | 'amendment' | 'exhibit',
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id: contractId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, contractNumber: true },
      });
      if (!contract) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Contract not found' },
        });
      }

      const document = await tx.document.findFirst({
        where: { id: documentId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, documentNumber: true },
      });
      if (!document) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document not found' },
        });
      }

      // Check for existing link
      const existing = await tx.contractDocumentLink.findUnique({
        where: {
          contractId_documentId_linkType: { contractId, documentId, linkType },
        },
      });
      if (existing) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Document is already linked to this contract with this link type',
          },
        });
      }

      const link = await tx.contractDocumentLink.create({
        data: {
          contractId,
          documentId,
          organizationId: ctx.organizationId,
          linkType,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'update',
        objectType: 'contract',
        objectId: contractId,
        correlationId: contract.contractNumber,
        afterState: { linkedDocumentId: documentId, linkType },
      });

      return link;
    });
  }

  async unlinkFromContract(
    ctx: TenantContext,
    contractId: string,
    documentId: string,
    linkType: string,
  ) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const link = await tx.contractDocumentLink.findUnique({
        where: {
          contractId_documentId_linkType: { contractId, documentId, linkType },
        },
      });
      if (!link) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document link not found' },
        });
      }

      await tx.contractDocumentLink.delete({ where: { id: link.id } });

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
