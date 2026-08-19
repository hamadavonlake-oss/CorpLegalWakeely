import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TenantContext as TenantContextType } from '@glo/shared';

/**
 * Parameter decorator that extracts `tenantContext` from the request object.
 *
 * Usage:
 *   @Get('things')
 *   findAll(@TenantCtx() ctx: TenantContextType) { ... }
 */
export const TenantCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContextType | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantContext;
  },
);
