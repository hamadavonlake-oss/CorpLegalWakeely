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
import { ContractStatus } from '@glo/shared';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { TenantCtx } from '../common/decorators/tenant-context.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ContractsService } from './contracts.service';
import {
  CreateContractDto,
  UpdateContractDto,
  TransitionContractDto,
  CreateContractPartyDto,
  UpdateContractPartyDto,
  CreateContractValueDto,
  RecordSignatureDto,
  CreateContractSignatureDto,
} from './dto/contract.dto';
import { IsOptional, IsEnum, IsUUID } from 'class-validator';

class ListContractsQuery extends PaginationDto {
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  matterId?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;
}

@ApiTags('Contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contracts')
export class ContractsController {
  private readonly logger = new Logger(ContractsController.name);

  constructor(private readonly contracts: ContractsService) {}

  // ─── Contract CRUD ──────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new contract' })
  async create(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: CreateContractDto,
  ): Promise<ApiResponse> {
    const c = await this.contracts.create(ctx, dto);
    return { success: true, data: c };
  }

  @Get()
  @ApiOperation({ summary: 'List contracts for the current tenant' })
  async list(
    @TenantCtx() ctx: TenantContext,
    @Query() query: ListContractsQuery,
  ): Promise<ApiResponse> {
    const result = await this.contracts.list(ctx, query);
    return { success: true, data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single contract with parties, values, signatures' })
  async findOne(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const c = await this.contracts.findOne(ctx, id);
    return { success: true, data: c };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a contract (editable states only)' })
  async update(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
  ): Promise<ApiResponse> {
    const c = await this.contracts.update(ctx, id, dto);
    return { success: true, data: c };
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Transition a contract to a new status (13-state machine)' })
  async transition(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: TransitionContractDto,
  ): Promise<ApiResponse> {
    const c = await this.contracts.transition(ctx, id, dto.to, dto.reason);
    return { success: true, data: c };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a contract (draft or draft_new_version only)' })
  async softDelete(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const result = await this.contracts.softDelete(ctx, id);
    return result;
  }

  // ─── Contract Parties ──────────────────────────────────────────────

  @Post(':id/parties')
  @ApiOperation({ summary: 'Add a party to a contract' })
  async addParty(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: CreateContractPartyDto,
  ): Promise<ApiResponse> {
    const p = await this.contracts.addParty(ctx, id, dto);
    return { success: true, data: p };
  }

  @Get(':id/parties')
  @ApiOperation({ summary: 'List parties for a contract' })
  async listParties(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const parties = await this.contracts.listParties(ctx, id);
    return { success: true, data: parties };
  }

  @Patch(':id/parties/:partyId')
  @ApiOperation({ summary: 'Update a contract party' })
  async updateParty(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Param('partyId') partyId: string,
    @Body() dto: UpdateContractPartyDto,
  ): Promise<ApiResponse> {
    const p = await this.contracts.updateParty(ctx, id, partyId, dto);
    return { success: true, data: p };
  }

  @Delete(':id/parties/:partyId')
  @ApiOperation({ summary: 'Remove a party from a contract' })
  async removeParty(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Param('partyId') partyId: string,
  ): Promise<ApiResponse> {
    const result = await this.contracts.removeParty(ctx, id, partyId);
    return result;
  }

  // ─── Contract Values ───────────────────────────────────────────────

  @Post(':id/values')
  @ApiOperation({ summary: 'Add a value line to a contract' })
  async addValue(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: CreateContractValueDto,
  ): Promise<ApiResponse> {
    const v = await this.contracts.addValue(ctx, id, dto);
    return { success: true, data: v };
  }

  @Get(':id/values')
  @ApiOperation({ summary: 'List value lines for a contract' })
  async listValues(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const values = await this.contracts.listValues(ctx, id);
    return { success: true, data: values };
  }

  @Delete(':id/values/:valueId')
  @ApiOperation({ summary: 'Remove a value line from a contract' })
  async removeValue(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Param('valueId') valueId: string,
  ): Promise<ApiResponse> {
    const result = await this.contracts.removeValue(ctx, id, valueId);
    return result;
  }

  // ─── Contract Signatures (manual) ───────────────────────────────────

  @Post(':id/signatures')
  @ApiOperation({ summary: 'Add a signature record (signer) to a contract' })
  async addSignature(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: CreateContractSignatureDto,
  ): Promise<ApiResponse> {
    const s = await this.contracts.addSignature(ctx, id, dto);
    return { success: true, data: s };
  }

  @Get(':id/signatures')
  @ApiOperation({ summary: 'List signature records for a contract' })
  async listSignatures(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const signatures = await this.contracts.listSignatures(ctx, id);
    return { success: true, data: signatures };
  }

  @Post(':id/signatures/:signatureId/record')
  @ApiOperation({ summary: 'Record manual signature status (signed/declined) + uploaded copy URL' })
  async recordSignature(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
    @Param('signatureId') signatureId: string,
    @Body() dto: RecordSignatureDto,
  ): Promise<ApiResponse> {
    const result = await this.contracts.recordSignature(ctx, id, signatureId, dto);
    return { success: true, data: result };
  }
}
