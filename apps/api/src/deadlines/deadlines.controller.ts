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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { ApiResponse, TenantContext } from '@glo/shared';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { TenantCtx } from '../common/decorators/tenant-context.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { DeadlinesService } from './deadlines.service';
import { CreateDeadlineDto, UpdateDeadlineDto } from './dto/deadline.dto';
import { IsOptional, IsIn, IsUUID } from 'class-validator';

class ListDeadlinesQuery extends PaginationDto {
  @IsOptional()
  @IsIn(['matter', 'contract', 'request'])
  parentType?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsIn(['pending', 'completed', 'overdue', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  upcoming?: boolean;
}

@ApiTags('Deadlines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('deadlines')
export class DeadlinesController {
  constructor(private readonly deadlines: DeadlinesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a deadline for a matter/contract/request' })
  async create(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: CreateDeadlineDto,
  ): Promise<ApiResponse> {
    const d = await this.deadlines.create(ctx, dto);
    return { success: true, data: d };
  }

  @Get()
  @ApiOperation({ summary: 'List deadlines (filterable by parent, status, assignee)' })
  async list(
    @TenantCtx() ctx: TenantContext,
    @Query() query: ListDeadlinesQuery,
  ): Promise<ApiResponse> {
    const result = await this.deadlines.list(ctx, query);
    return { success: true, data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single deadline' })
  async findOne(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const d = await this.deadlines.findOne(ctx, id);
    return { success: true, data: d };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a deadline (title, due date, status, etc.)' })
  async update(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateDeadlineDto,
  ): Promise<ApiResponse> {
    const d = await this.deadlines.update(ctx, id, dto);
    return { success: true, data: d };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete (cancel) a deadline' })
  async softDelete(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const result = await this.deadlines.softDelete(ctx, id);
    return result;
  }

  @Post('process-reminders')
  @ApiOperation({ summary: 'Process deadline reminders (manual trigger — normally run by cron)' })
  async processReminders(): Promise<ApiResponse> {
    const result = await this.deadlines.processReminders();
    return { success: true, data: result };
  }
}
