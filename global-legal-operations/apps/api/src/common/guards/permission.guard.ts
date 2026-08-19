import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { ERROR_CODES } from '@glo/shared';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { Request } from 'express';
import type { RoleCode } from '@glo/shared';

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions are required, allow through
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as {
      sub: string;
      organizationId: string;
      roles: RoleCode[];
    } | undefined;

    if (!user) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message: 'No user context available',
        },
      });
    }

    // Fetch role IDs for the user's roles
    const roles = await this.prisma.role.findMany({
      where: {
        code: { in: user.roles as string[] },
        ...(user.organizationId
          ? { OR: [{ organizationId: null }, { organizationId: user.organizationId }] }
          : { organizationId: null }),
      },
      select: { id: true },
    });

    const roleIds = roles.map((r) => r.id);

    if (roleIds.length === 0) {
      this.logger.warn(`No roles found for user roles: [${user.roles.join(', ')}]`);
      throw new ForbiddenException({
        success: false,
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message: 'Insufficient permissions',
        },
      });
    }

    // Check if any of the user's roles have ALL required permissions
    const permissionCount = await this.prisma.rolePermission.count({
      where: {
        roleId: { in: roleIds },
        permission: {
          code: { in: requiredPermissions },
        },
      },
      });

    const hasAllPermissions = permissionCount >= requiredPermissions.length;

    if (!hasAllPermissions) {
      this.logger.warn(
        `Permission denied: userId=${user.sub} requires [${requiredPermissions.join(', ')}]`,
      );
      throw new ForbiddenException({
        success: false,
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message: 'Insufficient permissions',
        },
      });
    }

    return true;
  }
}
