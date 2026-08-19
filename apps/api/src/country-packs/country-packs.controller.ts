import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { ApiResponse, TenantContext } from '@glo/shared';
import { CountryPacksService } from './country-packs.service';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { TenantCtx } from '../common/decorators/tenant-context.decorator';

@ApiTags('Country Packs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('country-packs')
export class CountryPacksController {
  private readonly logger = new Logger(CountryPacksController.name);

  constructor(private readonly countryPacksService: CountryPacksService) {}

  @Get()
  @ApiOperation({ summary: 'List all available country packs' })
  async listPacks(): Promise<ApiResponse> {
    const packs = await this.countryPacksService.listAvailablePacks();
    return {
      success: true,
      data: packs,
    };
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get country pack details' })
  async getPack(@Param('code') code: string): Promise<ApiResponse> {
    const pack = await this.countryPacksService.loadCountryPack(code);
    return {
      success: true,
      data: pack,
    };
  }

  @Post(':code/activate')
  @ApiOperation({ summary: 'Activate a country pack for the current organization' })
  async activatePack(
    @TenantCtx() ctx: TenantContext,
    @Param('code') code: string,
  ): Promise<ApiResponse> {
    const result = await this.countryPacksService.activateCountryPack(
      ctx.organizationId,
      code,
    );
    return {
      success: true,
      data: result,
    };
  }
}
