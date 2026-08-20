import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { ApiResponse, TenantContext } from '@glo/shared';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { TenantCtx } from '../common/decorators/tenant-context.decorator';
import { SearchService } from './search.service';
import { IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

class SearchQueryDto {
  q!: string;

  @IsOptional()
  @IsIn(['legal_request', 'matter', 'contract', 'document'])
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@ApiTags('Search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search across requests, matters, contracts, and documents' })
  async search(
    @TenantCtx() ctx: TenantContext,
    @Query() query: SearchQueryDto,
  ): Promise<ApiResponse> {
    const result = await this.searchService.search(ctx, query.q, {
      type: query.type,
      limit: query.limit,
    });
    return { success: true, data: result };
  }
}
