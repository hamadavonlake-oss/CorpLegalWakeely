import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { ApiResponse, TenantContext } from '@glo/shared';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { TenantCtx } from '../common/decorators/tenant-context.decorator';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { CreateEntityDto } from './dto/create-entity.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  private readonly logger = new Logger(OrganizationsController.name);

  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user\'s organization' })
  async getMe(
    @TenantCtx() ctx: TenantContext,
  ): Promise<ApiResponse> {
    const org = await this.organizationsService.findOne(ctx.organizationId);
    return {
      success: true,
      data: org,
    };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current organization' })
  async updateMe(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<ApiResponse> {
    const org = await this.organizationsService.updateOrg(ctx.organizationId, dto);
    return {
      success: true,
      data: org,
    };
  }

  @Get('me/entities')
  @ApiOperation({ summary: 'List entities for current organization' })
  async listEntities(
    @TenantCtx() ctx: TenantContext,
    @Query() pagination: PaginationDto,
  ): Promise<ApiResponse> {
    const result = await this.organizationsService.listEntities(ctx.organizationId, pagination);
    return {
      success: true,
      data: result,
    };
  }

  @Post('me/entities')
  @ApiOperation({ summary: 'Create entity in current organization' })
  async createEntity(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: CreateEntityDto,
  ): Promise<ApiResponse> {
    const entity = await this.organizationsService.createEntity(ctx.organizationId, dto);
    return {
      success: true,
      data: entity,
    };
  }

  @Get('me/departments')
  @ApiOperation({ summary: 'List departments for current organization' })
  async listDepartments(
    @TenantCtx() ctx: TenantContext,
    @Query() pagination: PaginationDto,
  ): Promise<ApiResponse> {
    const result = await this.organizationsService.listDepartments(ctx.organizationId, pagination);
    return {
      success: true,
      data: result,
    };
  }

  @Post('me/departments')
  @ApiOperation({ summary: 'Create department in current organization' })
  async createDepartment(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: CreateDepartmentDto & { entityId: string },
  ): Promise<ApiResponse> {
    const department = await this.organizationsService.createDepartment(
      ctx.organizationId,
      dto.entityId,
      { name: dto.name, nameEn: dto.nameEn },
    );
    return {
      success: true,
      data: department,
    };
  }

  @Patch('me/settings')
  @ApiOperation({ summary: 'Update organization settings' })
  async updateSettings(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: UpdateSettingsDto,
  ): Promise<ApiResponse> {
    const settings = await this.organizationsService.updateSettings(ctx.organizationId, dto);
    return {
      success: true,
      data: settings,
    };
  }
}
