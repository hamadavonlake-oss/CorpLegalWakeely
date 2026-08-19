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
import { ApprovalsService } from './approvals.service';
import {
  CreateApprovalRuleDto,
  UpdateApprovalRuleDto,
  SubmitForApprovalDto,
  DecideApprovalStepDto,
  DelegateApprovalStepDto,
  SkipApprovalStepDto,
} from './dto/approval.dto';
import { IsOptional, IsIn, IsBoolean } from 'class-validator';

class ListRulesQuery extends PaginationDto {
  @IsOptional()
  @IsIn(['contract', 'document'])
  objectType?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags('Approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('approvals')
export class ApprovalsController {
  private readonly logger = new Logger(ApprovalsController.name);

  constructor(private readonly approvals: ApprovalsService) {}

  // ─── Rule Management ──────────────────────────────────────────────

  @Post('rules')
  @ApiOperation({ summary: 'Create an approval rule (with conditions + steps)' })
  async createRule(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: CreateApprovalRuleDto,
  ): Promise<ApiResponse> {
    const rule = await this.approvals.createRule(ctx, dto);
    return { success: true, data: rule };
  }

  @Get('rules')
  @ApiOperation({ summary: 'List approval rules' })
  async listRules(
    @TenantCtx() ctx: TenantContext,
    @Query() query: ListRulesQuery,
  ): Promise<ApiResponse> {
    const result = await this.approvals.listRules(ctx, query);
    return { success: true, data: result };
  }

  @Get('rules/:id')
  @ApiOperation({ summary: 'Get an approval rule with conditions and steps' })
  async findRule(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const rule = await this.approvals.findRule(ctx, id);
    return { success: true, data: rule };
  }

  @Patch('rules/:id')
  @ApiOperation({ summary: 'Update an approval rule' })
  async updateRule(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateApprovalRuleDto,
  ): Promise<ApiResponse> {
    const rule = await this.approvals.updateRule(ctx, id, dto);
    return { success: true, data: rule };
  }

  @Delete('rules/:id')
  @ApiOperation({ summary: 'Soft-delete an approval rule (blocked if pending instances)' })
  async deleteRule(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const result = await this.approvals.softDeleteRule(ctx, id);
    return result;
  }

  // ─── Instance Management ──────────────────────────────────────────

  @Post('submit')
  @ApiOperation({ summary: 'Submit a contract/document for approval' })
  async submitForApproval(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: SubmitForApprovalDto,
  ): Promise<ApiResponse> {
    const result = await this.approvals.submitForApproval(ctx, dto);
    return { success: true, data: result };
  }

  @Get('instances/:id')
  @ApiOperation({ summary: 'Get an approval instance with its steps' })
  async findInstance(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const instance = await this.approvals.findInstance(ctx, id);
    return { success: true, data: instance };
  }

  @Get('instances/by-object/:objectType/:objectId')
  @ApiOperation({ summary: 'List all approval instances for a contract/document' })
  async listInstancesForObject(
    @TenantCtx() ctx: TenantContext,
    @Param('objectType') objectType: 'contract' | 'document',
    @Param('objectId') objectId: string,
  ): Promise<ApiResponse> {
    const instances = await this.approvals.listInstancesForObject(ctx, objectType, objectId);
    return { success: true, data: instances };
  }

  @Post('instances/:id/cancel')
  @ApiOperation({ summary: 'Cancel a pending approval instance (submitter or admin only)' })
  async cancelInstance(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ): Promise<ApiResponse> {
    const result = await this.approvals.cancelInstance(ctx, id, reason);
    return result;
  }

  // ─── Step Decisions ───────────────────────────────────────────────

  @Post('steps/:id/decide')
  @ApiOperation({ summary: 'Approve / reject / request changes on a step' })
  async decideStep(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: DecideApprovalStepDto,
  ): Promise<ApiResponse> {
    const result = await this.approvals.decideStep(ctx, id, dto.decision, dto.notes);
    return { success: true, data: result };
  }

  @Post('steps/:id/delegate')
  @ApiOperation({ summary: 'Delegate a step to another user (if canDelegate=true)' })
  async delegateStep(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: DelegateApprovalStepDto,
  ): Promise<ApiResponse> {
    const step = await this.approvals.delegateStep(ctx, id, dto.delegateTo, dto.notes);
    return { success: true, data: step };
  }

  @Post('steps/:id/skip')
  @ApiOperation({ summary: 'Skip a step (if canSkip=true)' })
  async skipStep(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: SkipApprovalStepDto,
  ): Promise<ApiResponse> {
    const result = await this.approvals.skipStep(ctx, id, dto.reason);
    return { success: true, data: result };
  }

  // ─── My Pending Steps ─────────────────────────────────────────────

  @Get('my-pending')
  @ApiOperation({ summary: 'List approval steps assigned to me that are pending' })
  async listMyPendingSteps(
    @TenantCtx() ctx: TenantContext,
    @Query() pagination: PaginationDto,
  ): Promise<ApiResponse> {
    const result = await this.approvals.listMyPendingSteps(ctx, pagination);
    return { success: true, data: result };
  }
}
