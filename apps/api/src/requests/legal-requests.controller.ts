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
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { ApiResponse, TenantContext } from '@glo/shared';
import { LegalRequestStatus } from '@glo/shared';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { TenantCtx } from '../common/decorators/tenant-context.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { LegalRequestsService } from './legal-requests.service';
import {
  CreateLegalRequestDto,
  UpdateLegalRequestDto,
  TransitionLegalRequestDto,
} from './dto/legal-request.dto';
import { IsOptional, IsEnum } from 'class-validator';

class ListLegalRequestsQuery extends PaginationDto {
  @IsOptional()
  @IsEnum(LegalRequestStatus)
  status?: LegalRequestStatus;
}

@ApiTags('Legal Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('legal-requests')
export class LegalRequestsController {
  private readonly logger = new Logger(LegalRequestsController.name);

  constructor(private readonly requests: LegalRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new legal request' })
  async create(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: CreateLegalRequestDto,
  ): Promise<ApiResponse> {
    const req = await this.requests.create(ctx, dto);
    return { success: true, data: req };
  }

  @Get()
  @ApiOperation({ summary: 'List legal requests for the current tenant' })
  async list(
    @TenantCtx() ctx: TenantContext,
    @Query() query: ListLegalRequestsQuery,
  ): Promise<ApiResponse> {
    const result = await this.requests.list(ctx, query);
    return { success: true, data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single legal request by ID' })
  async findOne(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const req = await this.requests.findOne(ctx, id);
    return { success: true, data: req };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a legal request (draft or waiting_for_information only)' })
  async update(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateLegalRequestDto,
  ): Promise<ApiResponse> {
    const req = await this.requests.update(ctx, id, dto);
    return { success: true, data: req };
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Transition a legal request to a new status' })
  async transition(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: TransitionLegalRequestDto,
  ): Promise<ApiResponse> {
    const req = await this.requests.transition(ctx, id, dto.to, dto.reason);
    return { success: true, data: req };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a legal request (draft or cancelled only)' })
  async softDelete(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const result = await this.requests.softDelete(ctx, id);
    return result;
  }
}
