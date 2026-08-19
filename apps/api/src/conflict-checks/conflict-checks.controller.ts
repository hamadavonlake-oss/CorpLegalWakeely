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
import { ConflictCheckStatus } from '@glo/shared';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { TenantCtx } from '../common/decorators/tenant-context.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ConflictChecksService } from './conflict-checks.service';
import {
  CreateConflictCheckDto,
  UpdateConflictCheckDto,
  TransitionConflictCheckDto,
} from './dto/conflict-check.dto';
import { IsOptional, IsEnum, IsIn } from 'class-validator';

class ListConflictChecksQuery extends PaginationDto {
  @IsOptional()
  @IsEnum(ConflictCheckStatus)
  status?: ConflictCheckStatus;
}

class ParentQueryDto {
  @IsIn(['matter'])
  parentType!: 'matter';

  @IsOptional()
  @IsEnum(ConflictCheckStatus)
  status?: ConflictCheckStatus;
}

@ApiTags('Conflict Checks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conflict-checks')
export class ConflictChecksController {
  private readonly logger = new Logger(ConflictChecksController.name);

  constructor(private readonly service: ConflictChecksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a conflict check for a matter' })
  async create(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: CreateConflictCheckDto,
  ): Promise<ApiResponse> {
    const check = await this.service.create(ctx, dto);
    return { success: true, data: check };
  }

  @Get()
  @ApiOperation({ summary: 'List conflict checks for the current tenant' })
  async list(
    @TenantCtx() ctx: TenantContext,
    @Query() query: ListConflictChecksQuery,
  ): Promise<ApiResponse> {
    const result = await this.service.list(ctx, query);
    return { success: true, data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single conflict check by ID' })
  async findOne(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const check = await this.service.findOne(ctx, id);
    return { success: true, data: check };
  }

  @Get('by-parent/:parentType/:parentId')
  @ApiOperation({ summary: 'Get the conflict check for a specific matter' })
  async findByParent(
    @TenantCtx() ctx: TenantContext,
    @Param('parentType') parentType: 'matter',
    @Param('parentId') parentId: string,
  ): Promise<ApiResponse> {
    const check = await this.service.findByParent(ctx, parentType, parentId);
    return { success: true, data: check };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a conflict check (names, notes, result summary)' })
  async update(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateConflictCheckDto,
  ): Promise<ApiResponse> {
    const check = await this.service.update(ctx, id, dto);
    return { success: true, data: check };
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Transition a conflict check to a new status' })
  async transition(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: TransitionConflictCheckDto,
  ): Promise<ApiResponse> {
    const check = await this.service.transition(ctx, id, dto.to, {
      reason: dto.reason,
      resultSummary: dto.resultSummary,
    });
    return { success: true, data: check };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a conflict check (only if not active)' })
  async softDelete(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const result = await this.service.softDelete(ctx, id);
    return result;
  }
}
