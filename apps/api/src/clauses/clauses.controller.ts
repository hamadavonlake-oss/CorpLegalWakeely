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
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { TenantCtx } from '../common/decorators/tenant-context.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ClausesService } from './clauses.service';
import { CreateClauseDto, UpdateClauseDto } from './dto/clause.dto';
import { IsOptional, IsIn, IsBoolean } from 'class-validator';

class ListClausesQuery extends PaginationDto {
  @IsOptional()
  @IsIn([
    'boilerplate', 'termination', 'confidentiality', 'payment',
    'liability', 'governing_law', 'dispute_resolution', 'force_majeure',
    'indemnification', 'warranty', 'assignment', 'amendment', 'misc',
  ])
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  countryCode?: string;
}

@ApiTags('Clauses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('clauses')
export class ClausesController {
  private readonly logger = new Logger(ClausesController.name);

  constructor(private readonly clauses: ClausesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a reusable clause' })
  async create(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: CreateClauseDto,
  ): Promise<ApiResponse> {
    const c = await this.clauses.create(ctx, dto);
    return { success: true, data: c };
  }

  @Get()
  @ApiOperation({ summary: 'List clauses' })
  async list(
    @TenantCtx() ctx: TenantContext,
    @Query() query: ListClausesQuery,
  ): Promise<ApiResponse> {
    const result = await this.clauses.list(ctx, query);
    return { success: true, data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a clause by ID' })
  async findOne(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const c = await this.clauses.findOne(ctx, id);
    return { success: true, data: c };
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get a clause by code' })
  async findByCode(
    @TenantCtx() ctx: TenantContext,
    @Param('code') code: string,
  ): Promise<ApiResponse> {
    const c = await this.clauses.findByCode(ctx, code);
    return { success: true, data: c };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a clause' })
  async update(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateClauseDto,
  ): Promise<ApiResponse> {
    const c = await this.clauses.update(ctx, id, dto);
    return { success: true, data: c };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a clause' })
  async softDelete(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const result = await this.clauses.softDelete(ctx, id);
    return result;
  }
}
