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
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { TenantCtx } from '../common/decorators/tenant-context.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TemplatesService } from './templates.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  FillTemplateDto,
  LinkClauseToTemplateDto,
} from './dto/template.dto';
import { IsOptional, IsIn, IsBoolean } from 'class-validator';

class ListTemplatesQuery extends PaginationDto {
  @IsOptional()
  @IsIn(['contract', 'letter', 'memo', 'notice', 'clause_set'])
  type?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags('Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplatesController {
  private readonly logger = new Logger(TemplatesController.name);

  constructor(private readonly templates: TemplatesService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a new DOCX template (multipart: file + metadata)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50_000_000 }, // 50MB max for templates
  }))
  async create(
    @TenantCtx() ctx: TenantContext,
    @UploadedFile() file: Express.Multer.File,
    @Body('templateCode') templateCode: string,
    @Body('name') name: string,
    @Body('nameEn') nameEn: string,
    @Body('description') description: string,
    @Body('type') type: string,
    @Body('countryCode') countryCode: string,
    @Body('locale') locale: string,
    @Body('variablesSchema') variablesSchemaStr: string,
    @Body('defaultValues') defaultValuesStr: string,
  ) {
    if (!file) {
      throw new BadRequestException({
        success: false,
        error: { code: 'COMMON.VALIDATION', message: 'Template file is required' },
      });
    }

    let variablesSchema: Record<string, unknown> | undefined;
    let defaultValues: Record<string, unknown> | undefined;
    try {
      if (variablesSchemaStr) variablesSchema = JSON.parse(variablesSchemaStr);
      if (defaultValuesStr) defaultValues = JSON.parse(defaultValuesStr);
    } catch (err) {
      throw new BadRequestException({
        success: false,
        error: { code: 'COMMON.VALIDATION', message: `Invalid JSON: ${(err as Error).message}` },
      });
    }

    const template = await this.templates.create(
      ctx,
      {
        templateCode,
        name,
        nameEn: nameEn || undefined,
        description: description || undefined,
        type,
        countryCode: countryCode || undefined,
        locale: locale || 'ar',
        variablesSchema,
        defaultValues,
        filename: file.originalname,
        mimeType: file.mimetype,
      },
      file.buffer,
    );
    return { success: true, data: template };
  }

  @Get()
  @ApiOperation({ summary: 'List templates' })
  async list(
    @TenantCtx() ctx: TenantContext,
    @Query() query: ListTemplatesQuery,
  ): Promise<ApiResponse> {
    const result = await this.templates.list(ctx, query);
    return { success: true, data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a template by ID' })
  async findOne(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const t = await this.templates.findOne(ctx, id);
    return { success: true, data: t };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update template metadata' })
  async update(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<ApiResponse> {
    const t = await this.templates.update(ctx, id, dto);
    return { success: true, data: t };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a template' })
  async softDelete(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const result = await this.templates.softDelete(ctx, id);
    return result;
  }

  @Post(':id/fill')
  @ApiOperation({ summary: 'Fill a template with variables → generates a new Document' })
  async fillTemplate(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: FillTemplateDto,
  ): Promise<ApiResponse> {
    const result = await this.templates.fillTemplate(ctx, id, dto);
    return { success: true, data: result };
  }

  @Post(':id/clauses')
  @ApiOperation({ summary: 'Link a clause to a template (with placeholder name)' })
  async linkClause(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: LinkClauseToTemplateDto,
  ): Promise<ApiResponse> {
    const link = await this.templates.linkClause(ctx, id, dto);
    return { success: true, data: link };
  }

  @Delete(':id/clauses/:clauseId/:placeholderName')
  @ApiOperation({ summary: 'Unlink a clause from a template' })
  async unlinkClause(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Param('clauseId') clauseId: string,
    @Param('placeholderName') placeholderName: string,
  ): Promise<ApiResponse> {
    const result = await this.templates.unlinkClause(ctx, id, clauseId, placeholderName);
    return result;
  }
}
