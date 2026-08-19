import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import type { ApiResponse, TenantContext } from '@glo/shared';
import { DocumentStatus } from '@glo/shared';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { TenantCtx } from '../common/decorators/tenant-context.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { DocumentsService } from './documents.service';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  TransitionDocumentDto,
  UpdateLegalHoldDto,
  UpdateRetentionDto,
  LinkDocumentToContractDto,
} from './dto/document.dto';
import { IsOptional, IsEnum, IsUUID, IsIn } from 'class-validator';

class ListDocumentsQuery extends PaginationDto {
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsOptional()
  @IsUUID()
  matterId?: string;

  @IsOptional()
  @IsUUID()
  legalRequestId?: string;

  @IsOptional()
  @IsIn([
    'contract_draft', 'signed_contract', 'exhibit', 'evidence',
    'correspondence', 'memo', 'other',
  ])
  type?: string;
}

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new document (metadata only — upload binary separately)' })
  async create(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: CreateDocumentDto,
  ): Promise<ApiResponse> {
    const doc = await this.documents.create(ctx, dto);
    return { success: true, data: doc };
  }

  @Get()
  @ApiOperation({ summary: 'List documents for the current tenant' })
  async list(
    @TenantCtx() ctx: TenantContext,
    @Query() query: ListDocumentsQuery,
  ): Promise<ApiResponse> {
    const result = await this.documents.list(ctx, query);
    return { success: true, data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single document with versions' })
  async findOne(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const doc = await this.documents.findOne(ctx, id);
    return { success: true, data: doc };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update document metadata (editable states only)' })
  async update(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ): Promise<ApiResponse> {
    const doc = await this.documents.update(ctx, id, dto);
    return { success: true, data: doc };
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Transition a document to a new status (7-state machine)' })
  async transition(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: TransitionDocumentDto,
  ): Promise<ApiResponse> {
    const doc = await this.documents.transition(ctx, id, dto.to, dto.reason);
    return { success: true, data: doc };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a document (blocked if Legal Hold is active)' })
  async softDelete(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const result = await this.documents.softDelete(ctx, id);
    return result;
  }

  // ─── Document Versions ─────────────────────────────────────────────

  @Post(':id/versions')
  @ApiOperation({ summary: 'Upload a new version of the document (immutable once approved)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 104_857_600 }, // 100MB max (Rule: MAX_UPLOAD_BYTES)
  }))
  async uploadVersion(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('changeSummary') changeSummary: string,
  ) {
    if (!file) {
      throw new BadRequestException({
        success: false,
        error: { code: 'COMMON.VALIDATION', message: 'File is required' },
      });
    }

    const version = await this.documents.uploadVersion(
      ctx,
      id,
      {
        filename: file.originalname,
        mimeType: file.mimetype,
        changeSummary,
      },
      file.buffer,
    );
    return { success: true, data: version };
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List all versions of a document' })
  async listVersions(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const versions = await this.documents.listVersions(ctx, id);
    return { success: true, data: versions };
  }

  @Get(':id/versions/:versionNumber')
  @ApiOperation({ summary: 'Get a specific document version' })
  async getVersion(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Param('versionNumber') versionNumber: string,
  ): Promise<ApiResponse> {
    const v = await this.documents.getVersion(ctx, id, parseInt(versionNumber, 10));
    return { success: true, data: v };
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get a signed download URL for the document (latest or specified version)' })
  async getDownloadUrl(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Query('version') version?: string,
  ): Promise<ApiResponse> {
    const result = await this.documents.getDownloadUrl(
      ctx,
      id,
      version ? parseInt(version, 10) : undefined,
    );
    return { success: true, data: result };
  }

  // ─── Legal Hold & Retention ───────────────────────────────────────

  @Post(':id/legal-hold')
  @ApiOperation({ summary: 'Toggle Legal Hold on a document (prevents deletion per Rule 10)' })
  async setLegalHold(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateLegalHoldDto,
  ): Promise<ApiResponse> {
    const doc = await this.documents.setLegalHold(ctx, id, dto.legalHold, dto.reason);
    return { success: true, data: doc };
  }

  @Patch(':id/retention')
  @ApiOperation({ summary: 'Set retention policy (when document can be permanently deleted)' })
  async setRetention(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateRetentionDto,
  ): Promise<ApiResponse> {
    const doc = await this.documents.setRetention(ctx, id, dto.retentionUntil, dto.reason);
    return { success: true, data: doc };
  }

  // ─── Contract Links ───────────────────────────────────────────────

  @Post(':id/links/contracts')
  @ApiOperation({ summary: 'Link this document to a contract' })
  async linkToContract(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: LinkDocumentToContractDto,
  ): Promise<ApiResponse> {
    const link = await this.documents.linkToContract(
      ctx,
      dto.contractId,
      id,
      dto.linkType,
    );
    return { success: true, data: link };
  }
}
