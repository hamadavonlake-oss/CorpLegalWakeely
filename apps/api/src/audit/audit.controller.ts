import { Controller, Get, Query, Param, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { ApiResponse, TenantContext } from '@glo/shared';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { TenantCtx } from '../common/decorators/tenant-context.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { IsOptional, IsString } from 'class-validator';

class AuditListFilterDto extends PaginationDto {
  @IsOptional()
  @IsString()
  objectType?: string;

  @IsOptional()
  @IsString()
  objectId?: string;

  @IsOptional()
  @IsString()
  actorId?: string;
}

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
  private readonly logger = new Logger(AuditController.name);

  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries for the current tenant' })
  async list(
    @TenantCtx() ctx: TenantContext,
    @Query() filter: AuditListFilterDto,
  ): Promise<ApiResponse> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const result = await this.auditService.list(ctx.organizationId, {
      page,
      limit,
      objectType: filter.objectType,
      objectId: filter.objectId,
      actorId: filter.actorId,
    });
    return { success: true, data: result };
  }

  @Get('verify')
  @ApiOperation({ summary: 'Verify the integrity of the audit hash chain' })
  async verify(@TenantCtx() ctx: TenantContext): Promise<ApiResponse> {
    const result = await this.auditService.verifyChain(ctx.organizationId);
    return { success: true, data: result };
  }
}
