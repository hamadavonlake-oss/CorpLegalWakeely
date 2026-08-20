import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService, STORAGE_SERVICE } from '../storage/storage.interface';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantTransactionService } from '../database/tenant-transaction.service';
import { AuditService } from '../audit/audit.service';
import { ERROR_CODES, DocumentStatus } from '@glo/shared';
import type { TenantContext } from '@glo/shared';
import { NotFoundException, BadRequestException } from '@nestjs/common';

/**
 * ExportService — converts documents to PDF using Gotenberg.
 *
 * Gotenberg is a Docker-based API that converts DOCX → PDF using
 * LibreOffice under the hood. The API endpoint is configured via
 * GOTENBERG_URL environment variable.
 *
 * Per ADR-006: DOCX templates via docxtemplater, PDF via Gotenberg.
 *
 * In development without Gotenberg running, the service throws a
 * clear error message telling the user to start Gotenberg.
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private readonly gotenbergUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
    private readonly audit: AuditService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {
    this.gotenbergUrl = this.config.get<string>(
      'GOTENBERG_URL',
      'http://localhost:3000',
    );
  }

  /**
   * Export a document version to PDF.
   *
   * 1. Fetch the document + version from DB
   * 2. Download the DOCX binary from storage
   * 3. Send to Gotenberg for conversion
   * 4. Upload the PDF as a new document version (or separate document)
   * 5. Return the PDF download URL
   *
   * @param documentId The document to export
   * @param versionNumber Optional specific version (defaults to current)
   * @returns Download URL + metadata for the generated PDF
   */
  async exportToPdf(
    ctx: TenantContext,
    documentId: string,
    versionNumber?: number,
  ): Promise<{
    url: string;
    filename: string;
    sizeBytes: number;
    newVersionNumber: number;
  }> {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      // 1. Fetch the document
      const document = await tx.document.findFirst({
        where: { id: documentId, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!document) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Document not found' },
        });
      }

      // 2. Fetch the specific version
      const targetVersion = versionNumber ?? document.currentVersion;
      const version = await tx.documentVersion.findFirst({
        where: {
          documentId,
          organizationId: ctx.organizationId,
          versionNumber: targetVersion,
        },
      });
      if (!version) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: `Version ${targetVersion} not found` },
        });
      }

      // 3. Download the DOCX from storage
      const docxBuffer = await this.storage.download(version.storageKey);
      if (!docxBuffer) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Source file not found in storage' },
        });
      }

      // 4. Convert via Gotenberg
      const pdfBuffer = await this.convertDocxToPdf(docxBuffer, version.filename);

      // 5. Upload the PDF as a new version
      const newVersionNumber = document.currentVersion + 1;
      const pdfStorageKey = `documents/${ctx.organizationId}/${documentId}/v${newVersionNumber}-export-${Date.now()}.pdf`;
      const uploadResult = await this.storage.upload(
        pdfStorageKey,
        pdfBuffer,
        'application/pdf',
      );

      // 6. Create the new version row
      await tx.documentVersion.create({
        data: {
          documentId,
          organizationId: ctx.organizationId,
          versionNumber: newVersionNumber,
          storageKey: uploadResult.storageKey,
          filename: `${version.filename.replace(/\.[^/.]+$/, '')}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: uploadResult.sizeBytes,
          contentHash: uploadResult.contentHash,
          changeSummary: `Exported to PDF from v${targetVersion}`,
          uploadedBy: ctx.userId,
        },
      });

      // 7. Update the document's current version + status
      await tx.document.update({
        where: { id: documentId },
        data: {
          currentVersion: newVersionNumber,
          mimeType: 'application/pdf',
          sizeBytes: uploadResult.sizeBytes,
          contentHash: uploadResult.contentHash,
          status: DocumentStatus.exported as unknown as import('@prisma/client').$Enums.DocumentStatus,
        },
      });

      // 8. Generate download URL
      const downloadUrl = await this.storage.getSignedDownloadUrl(uploadResult.storageKey);

      // 9. Audit log
      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'export',
        objectType: 'document',
        objectId: documentId,
        correlationId: document.documentNumber,
        afterState: {
          exportedFromVersion: targetVersion,
          newVersion: newVersionNumber,
          format: 'pdf',
          sizeBytes: uploadResult.sizeBytes,
        },
      });

      this.logger.log(
        `Document ${document.documentNumber} exported to PDF: v${targetVersion} → v${newVersionNumber} (${uploadResult.sizeBytes} bytes)`,
      );

      return {
        url: downloadUrl,
        filename: `${version.filename.replace(/\.[^/.]+$/, '')}.pdf`,
        sizeBytes: uploadResult.sizeBytes,
        newVersionNumber,
      };
    });
  }

  /**
   * Convert a DOCX buffer to PDF using Gotenberg.
   *
   * Gotenberg API: POST /forms/libreoffice/convert with the file as multipart.
   * Returns the PDF binary.
   */
  private async convertDocxToPdf(docxBuffer: Buffer, filename: string): Promise<Buffer> {
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('files', docxBuffer, {
      filename: filename || 'document.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const convertUrl = `${this.gotenbergUrl}/forms/libreoffice/convert`;

    try {
      const response = await fetch(convertUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gotenberg returned ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      this.logger.error(`Gotenberg conversion failed: ${(err as Error).message}`);
      throw new BadRequestException({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: `PDF export failed: ${(err as Error).message}. Ensure Gotenberg is running at ${this.gotenbergUrl}.`,
        },
      });
    }
  }
}
