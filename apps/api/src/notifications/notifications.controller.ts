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
  Sse,
  Req,
  Logger,
  MessageEvent,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Observable, interval, merge } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import type { Request } from 'express';
import type { ApiResponse, TenantContext } from '@glo/shared';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { TenantCtx } from '../common/decorators/tenant-context.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { NotificationsService } from './notifications.service';
import {
  UpdateNotificationPreferencesDto,
} from './dto/notification.dto';
import { IsOptional, IsBoolean, IsString } from 'class-validator';

class ListNotificationsQuery extends PaginationDto {
  @IsOptional()
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @IsString()
  type?: string;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notifications: NotificationsService) {}

  // ─── List + Counts ──────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List notifications for the current user' })
  async list(
    @TenantCtx() ctx: TenantContext,
    @Query() query: ListNotificationsQuery,
  ): Promise<ApiResponse> {
    const result = await this.notifications.list(ctx, query);
    return { success: true, data: result };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread + total notification counts' })
  async getUnreadCount(@TenantCtx() ctx: TenantContext): Promise<ApiResponse> {
    const counts = await this.notifications.getUnreadCount(ctx);
    return { success: true, data: counts };
  }

  // ─── SSE Stream ─────────────────────────────────────────────────

  /**
   * Server-Sent Events endpoint for real-time notifications.
   *
   * Clients connect via `EventSource('/api/v1/notifications/stream')` and
   * receive notifications as they're created.
   *
   * Heartbeat: every 30 seconds, sends a comment to keep the connection
   * alive (prevents proxies/load balancers from closing idle connections).
   *
   * On disconnect: the user's stream is unsubscribed to prevent leaks.
   */
  @Sse('stream')
  @ApiOperation({ summary: 'SSE stream for real-time notifications' })
  stream(
    @TenantCtx() ctx: TenantContext,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    this.logger.log(`SSE connection opened for user ${ctx.userId}`);

    // Subscribe to this user's notification stream
    const notificationStream = this.notifications.subscribeToUserStream(ctx.userId);

    // Heartbeat: send a comment every 30s to keep the connection alive
    const heartbeat = interval(30000).pipe(
      map(() => ({
        type: 'heartbeat',
        data: { timestamp: new Date().toISOString() },
      }) as MessageEvent),
    );

    // Merge notification events + heartbeat
    const merged = merge(notificationStream, heartbeat).pipe(
      map((event) => {
        // Map NotificationEvent to MessageEvent
        if ('type' in event && event.type === 'heartbeat') {
          return event as MessageEvent;
        }
        const notif = event as { id: string; type: string; title: string; body: string; severity: string; actionUrl?: string; createdAt: Date };
        return {
          type: 'notification',
          data: {
            id: notif.id,
            type: notif.type,
            title: notif.title,
            body: notif.body,
            severity: notif.severity,
            actionUrl: notif.actionUrl,
            createdAt: notif.createdAt,
          },
        } as MessageEvent;
      }),
    );

    // When the request closes, unsubscribe
    req.on('close', () => {
      this.logger.log(`SSE connection closed for user ${ctx.userId}`);
      this.notifications.unsubscribeUserStream(ctx.userId);
    });

    return merged.pipe(takeUntil(new Observable<void>((subscriber) => {
      req.on('close', () => subscriber.next());
    })));
  }

  // ─── Mark Read / Unread ─────────────────────────────────────────

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markRead(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const n = await this.notifications.markRead(ctx, id);
    return { success: true, data: n };
  }

  @Post('mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@TenantCtx() ctx: TenantContext): Promise<ApiResponse> {
    const result = await this.notifications.markAllRead(ctx);
    return result;
  }

  @Post(':id/unread')
  @ApiOperation({ summary: 'Mark a notification as unread' })
  async markUnread(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const n = await this.notifications.markUnread(ctx, id);
    return { success: true, data: n };
  }

  // ─── Delete ─────────────────────────────────────────────────────

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  async delete(
    @TenantCtx() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<ApiResponse> {
    const result = await this.notifications.delete(ctx, id);
    return result;
  }

  // ─── Preferences ────────────────────────────────────────────────

  @Get('preferences')
  @ApiOperation({ summary: 'Get current user notification preferences' })
  async getPreferences(@TenantCtx() ctx: TenantContext): Promise<ApiResponse> {
    const prefs = await this.notifications.getPreferences(ctx);
    return { success: true, data: prefs };
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  async updatePreferences(
    @TenantCtx() ctx: TenantContext,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<ApiResponse> {
    const prefs = await this.notifications.updatePreferences(ctx, dto);
    return { success: true, data: prefs };
  }
}
