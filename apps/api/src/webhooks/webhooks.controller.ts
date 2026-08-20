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
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';
import { IsOptional, IsIn, IsUUID } from 'class-validator';

class ListWebhooksQuery extends PaginationDto {
  @IsOptional()
  @IsIn([true, false])
  isActive?: boolean;
}

class ListDeliveriesQuery extends PaginationDto {
  @IsOptional()
  @IsUUID()
  webhookId?: string;

  @IsOptional()
  @IsIn(['pending', 'success', 'failed', 'dead_letter'])
  status?: string;

  @IsOptional()
  eventType?: string;
}

@ApiTags('Webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new webhook endpoint (returns secret once)' })
  async create(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: CreateWebhookDto,
  ): Promise<ApiResponse> {
    const result = await this.webhooks.create(ctx, dto);
    return { success: true, data: result };
  }

  @Get()
  @ApiOperation({ summary: 'List webhooks for the current tenant' })
  async list(
    @TenantCtx() ctx: TenantContext,
    @Query() query: ListWebhooksQuery,
  ): Promise<ApiResponse> {
    const result = await this.webhooks.list(ctx, query);
    return { success: true, data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a webhook by ID' })
  async findOne(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const w = await this.webhooks.findOne(ctx, id);
    return { success: true, data: w };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a webhook' })
  async update(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
  ): Promise<ApiResponse> {
    const w = await this.webhooks.update(ctx, id, dto);
    return { success: true, data: w };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a webhook' })
  async softDelete(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const result = await this.webhooks.softDelete(ctx, id);
    return result;
  }

  // ─── Deliveries ───────────────────────────────────────────────────

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'List delivery attempts for a webhook' })
  async listDeliveries(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Query() query: ListDeliveriesQuery,
  ): Promise<ApiResponse> {
    const result = await this.webhooks.listDeliveries(ctx, { ...query, webhookId: id });
    return { success: true, data: result };
  }

  @Get('deliveries/all')
  @ApiOperation({ summary: 'List all webhook deliveries for the current tenant' })
  async listAllDeliveries(
    @TenantCtx() ctx: TenantContext,
    @Query() query: ListDeliveriesQuery,
  ): Promise<ApiResponse> {
    const result = await this.webhooks.listDeliveries(ctx, query);
    return { success: true, data: result };
  }

  @Post('deliveries/:deliveryId/retry')
  @ApiOperation({ summary: 'Manually retry a dead-lettered delivery' })
  async retryDelivery(
    @TenantCtx() ctx: TenantContext,
    @Param('deliveryId') deliveryId: string,
  ): Promise<ApiResponse> {
    const result = await this.webhooks.retryDelivery(ctx, deliveryId);
    return { success: true, data: result };
  }

  @Post('process-pending')
  @ApiOperation({ summary: 'Process pending webhook deliveries (manual trigger — normally run by cron)' })
  async processPending(): Promise<ApiResponse> {
    const result = await this.webhooks.processPendingDeliveries();
    return { success: true, data: result };
  }
}
