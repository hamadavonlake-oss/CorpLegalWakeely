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
import { MatterStatus } from '@glo/shared';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { TenantCtx } from '../common/decorators/tenant-context.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { MattersService } from './matters.service';
import {
  CreateMatterDto,
  UpdateMatterDto,
  TransitionMatterDto,
  LinkRequestToMatterDto,
  ConvertRequestToMatterDto,
} from './dto/matter.dto';
import { IsOptional, IsEnum } from 'class-validator';

class ListMattersQuery extends PaginationDto {
  @IsOptional()
  @IsEnum(MatterStatus)
  status?: MatterStatus;
}

@ApiTags('Matters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('matters')
export class MattersController {
  private readonly logger = new Logger(MattersController.name);

  constructor(private readonly matters: MattersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new matter' })
  async create(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: CreateMatterDto,
  ): Promise<ApiResponse> {
    const m = await this.matters.create(ctx, dto);
    return { success: true, data: m };
  }

  @Get()
  @ApiOperation({ summary: 'List matters for the current tenant' })
  async list(
    @TenantCtx() ctx: TenantContext,
    @Query() query: ListMattersQuery,
  ): Promise<ApiResponse> {
    const result = await this.matters.list(ctx, query);
    return { success: true, data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single matter by ID' })
  async findOne(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const m = await this.matters.findOne(ctx, id);
    return { success: true, data: m };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a matter' })
  async update(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateMatterDto,
  ): Promise<ApiResponse> {
    const m = await this.matters.update(ctx, id, dto);
    return { success: true, data: m };
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Transition a matter to a new status' })
  async transition(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: TransitionMatterDto,
  ): Promise<ApiResponse> {
    const m = await this.matters.transition(ctx, id, dto.to, dto.reason);
    return { success: true, data: m };
  }

  @Post(':id/links/requests')
  @ApiOperation({ summary: 'Link a legal request to this matter' })
  async linkRequest(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: LinkRequestToMatterDto,
  ): Promise<ApiResponse> {
    const link = await this.matters.linkRequest(ctx, id, dto.requestId);
    return { success: true, data: link };
  }

  @Delete(':id/links/requests/:requestId')
  @ApiOperation({ summary: 'Unlink a legal request from this matter' })
  async unlinkRequest(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
  ): Promise<ApiResponse> {
    const result = await this.matters.unlinkRequest(ctx, id, requestId);
    return result;
  }

  @Post('from-request/:requestId')
  @ApiOperation({ summary: 'Convert a legal request into a new matter (atomic)' })
  async convertRequest(
    @TenantCtx() ctx: TenantContext,
    @Param('requestId') requestId: string,
    @Body() dto: ConvertRequestToMatterDto,
  ): Promise<ApiResponse> {
    const result = await this.matters.convertRequestToMatter(ctx, requestId, dto);
    return { success: true, data: result };
  }
}
