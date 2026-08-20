import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import { TenantTransactionService } from '../database/tenant-transaction.service';
import { AuditService } from '../audit/audit.service';
import { ERROR_CODES, WEBHOOK_EVENT_TYPES } from '@glo/shared';
import type { PaginationDto, TenantContext, WebhookPayload } from '@glo/shared';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * WebhooksService — manages webhook endpoints and delivers events.
 *
 * Per ADR-011 / build-pack/02-mvp-prd.md:
 * - HMAC-SHA256 signed payloads (X-Webhook-Signature header)
 * - Retry with exponential backoff (5 retries max, base 5s)
 * - Dead-letter queue for permanently failed deliveries
 * - SSRF prevention (blocks private IP ranges: 10.x, 172.16-31.x, 192.168.x, 127.x)
 *
 * Security:
 * - Webhook secrets are stored hashed (Argon2id) — plaintext only shown at creation
 * - The signing secret used for HMAC is the plaintext, NOT the hash
 * - URLs are validated against SSRF patterns before delivery
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  // Retry config (per build-pack/02-mvp-prd.md: WEBHOOK_MAX_RETRIES = 5, base = 5000ms)
  private static readonly MAX_RETRIES = 5;
  private static readonly RETRY_BASE_MS = 5000;

  // Private IP ranges for SSRF prevention
  private static readonly SSRF_BLOCKED_PATTERNS = [
    /^127\./,                    // Loopback
    /^10\./,                     // Private class A
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private class B
    /^192\.168\./,               // Private class C
    /^0\./,                      // Reserved
    /^169\.254\./,               // Link-local
    /^::1$/,                      // IPv6 loopback
    /^fc00:/,                     // IPv6 unique local
    /^fe80:/,                     // IPv6 link-local
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
    private readonly audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // Webhook CRUD
  // ═══════════════════════════════════════════════════════════════

  async create(
    ctx: TenantContext,
    input: {
      name: string;
      nameEn?: string;
      url: string;
      events?: string[];
      isActive?: boolean;
      verifySsl?: boolean;
      secretHeaderName?: string;
    },
  ): Promise<{ webhook: Record<string, unknown>; secret: string }> {
    // Validate URL for SSRF
    this.validateUrl(input.url);

    // Generate a random secret (32 bytes = 64 hex chars)
    const secret = randomBytes(32).toString('hex');
    const secretHash = await argon2.hash(secret, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const webhook = await tx.webhook.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
          nameEn: input.nameEn,
          url: input.url,
          secretHash,
          events: input.events
            ? (input.events as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          isActive: input.isActive ?? true,
          verifySsl: input.verifySsl ?? true,
          secretHeaderName: input.secretHeaderName ?? 'X-Webhook-Signature',
          createdBy: ctx.userId,
        },
      });

      await this.audit.append({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'create',
        objectType: 'webhook',
        objectId: webhook.id,
        correlationId: webhook.name,
        afterState: { name: webhook.name, url: webhook.url },
      });

      this.logger.log(`Webhook created: ${webhook.name} → ${webhook.url}`);

      // Return the plaintext secret ONLY at creation time
      return { webhook, secret };
    });
  }

  async findOne(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const webhook = await tx.webhook.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        include: {
          _count: { select: { deliveries: true } },
        },
      });
      if (!webhook) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Webhook not found' },
        });
      }
      return webhook;
    });
  }

  async list(
    ctx: TenantContext,
    pagination: PaginationDto & { isActive?: boolean },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const where = {
        organizationId: ctx.organizationId,
        deletedAt: null,
        ...(pagination.isActive !== undefined ? { isActive: pagination.isActive } : {}),
      };

      const [rows, total] = await Promise.all([
        tx.webhook.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: { select: { deliveries: true } },
          },
        }),
        tx.webhook.count({ where }),
      ]);

      return {
        data: rows,
        meta: {
          page, limit, total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
        },
      };
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: {
      name?: string;
      nameEn?: string;
      url?: string;
      events?: string[];
      isActive?: boolean;
      verifySsl?: boolean;
    },
  ) {
    if (input.url) {
      this.validateUrl(input.url);
    }

    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.webhook.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Webhook not found' },
        });
      }

      const updateData: Record<string, unknown> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.nameEn !== undefined) updateData.nameEn = input.nameEn;
      if (input.url !== undefined) updateData.url = input.url;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      if (input.verifySsl !== undefined) updateData.verifySsl = input.verifySsl;
      if (input.events !== undefined) {
        updateData.events = input.events as Prisma.InputJsonValue;
      }

      return tx.webhook.update({ where: { id }, data: updateData });
    });
  }

  async softDelete(ctx: TenantContext, id: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const existing = await tx.webhook.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Webhook not found' },
        });
      }

      await tx.webhook.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: ctx.userId, isActive: false },
      });

      return { success: true };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Event Delivery
  // ═══════════════════════════════════════════════════════════════

  /**
   * Emit an event to all matching webhooks for an organization.
   * Creates delivery records but does NOT deliver synchronously —
   * the actual HTTP delivery is done by processPendingDeliveries().
   *
   * @param organizationId The org to emit for
   * @param eventType The event type (e.g. 'contract.created')
   * @param payload The event payload
   * @param secret The plaintext secret used for HMAC signing
   */
  async emitEvent(
    organizationId: string,
    eventType: string,
    payload: WebhookPayload,
    secret: string,
  ): Promise<{ delivered: number }> {
    // Find all active webhooks for this org that subscribe to this event
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null,
      },
    });

    let delivered = 0;

    for (const webhook of webhooks) {
      const events = (webhook.events as string[] | null) ?? [];
      // Empty events array = subscribe to all events
      if (events.length > 0 && !events.includes(eventType)) {
        continue; // This webhook doesn't subscribe to this event
      }

      // Compute HMAC-SHA256 signature
      const payloadString = JSON.stringify(payload);
      const signature = createHmac('sha256', secret)
        .update(payloadString, 'utf8')
        .digest('hex');

      // Create a delivery record
      await this.prisma.webhookDelivery.create({
        data: {
          organizationId,
          webhookId: webhook.id,
          eventType,
          payload: payload as unknown as Prisma.InputJsonValue,
          signature,
          status: 'pending',
          attemptCount: 0,
          maxAttempts: WebhooksService.MAX_RETRIES,
        },
      });

      delivered++;
    }

    this.logger.debug(`Event ${eventType} emitted to ${delivered} webhooks for org ${organizationId}`);
    return { delivered };
  }

  /**
   * Process pending webhook deliveries.
   * Called by a scheduled task (cron) — finds pending deliveries and
   * delivers them via HTTP POST with HMAC-SHA256 signature.
   *
   * Returns the count of deliveries processed.
   */
  async processPendingDeliveries(): Promise<{ processed: number; succeeded: number; failed: number; deadLettered: number }> {
    // Find pending deliveries (or failed with nextRetryAt in the past)
    const now = new Date();
    const pending = await this.prisma.webhookDelivery.findMany({
      where: {
        status: { in: ['pending', 'failed'] },
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: now } },
        ],
      },
      take: 50, // Process in batches
      include: { webhook: true },
    });

    let succeeded = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const delivery of pending) {
      if (delivery.webhook.deletedAt || !delivery.webhook.isActive) {
        // Webhook was deleted or deactivated — mark delivery as dead-lettered
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'dead_letter',
            errorMessage: 'Webhook deleted or inactive',
            completedAt: new Date(),
          },
        });
        deadLettered++;
        continue;
      }

      try {
        // Re-validate URL for SSRF before each delivery
        this.validateUrl(delivery.webhook.url);

        // Build the request
        const payloadString = JSON.stringify(delivery.payload);
        const headerName = delivery.webhook.secretHeaderName ?? 'X-Webhook-Signature';

        const response = await fetch(delivery.webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [headerName]: delivery.signature,
            'X-Webhook-Id': delivery.webhook.id,
            'X-Webhook-Event': delivery.eventType,
            'X-Webhook-Timestamp': new Date().toISOString(),
          },
          body: payloadString,
          signal: AbortSignal.timeout(30000), // 30s timeout
        });

        const responseText = await response.text().catch(() => '');

        if (response.ok) {
          // Success!
          await this.prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: 'success',
              responseStatus: response.status,
              responseBody: responseText.slice(0, 1000),
              attemptCount: delivery.attemptCount + 1,
              firstAttemptAt: delivery.firstAttemptAt ?? new Date(),
              completedAt: new Date(),
              nextRetryAt: null,
            },
          });
          succeeded++;
        } else {
          // Non-2xx response — treat as failure
          await this.handleDeliveryFailure(delivery, response.status, responseText.slice(0, 500));
          failed++;
        }
      } catch (err) {
        // Network error / timeout — treat as failure
        await this.handleDeliveryFailure(delivery, null, (err as Error).message);
        failed++;
      }
    }

    this.logger.log(
      `Processed ${pending.length} webhook deliveries: ${succeeded} succeeded, ${failed} failed, ${deadLettered} dead-lettered`,
    );

    return {
      processed: pending.length,
      succeeded,
      failed,
      deadLettered,
    };
  }

  /**
   * Manually retry a dead-lettered delivery.
   */
  async retryDelivery(ctx: TenantContext, deliveryId: string) {
    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const delivery = await tx.webhookDelivery.findFirst({
        where: { id: deliveryId, organizationId: ctx.organizationId },
        include: { webhook: true },
      });
      if (!delivery) {
        throw new NotFoundException({
          success: false,
          error: { code: ERROR_CODES.NOT_FOUND, message: 'Webhook delivery not found' },
        });
      }

      if (delivery.status !== 'dead_letter') {
        throw new BadRequestException({
          success: false,
          error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Only dead-lettered deliveries can be manually retried' },
        });
      }

      // Reset to pending for the processor to pick up
      return tx.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'pending',
          attemptCount: 0,
          nextRetryAt: null,
          errorMessage: null,
          completedAt: null,
        },
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Delivery queries
  // ═══════════════════════════════════════════════════════════════

  async listDeliveries(
    ctx: TenantContext,
    pagination: PaginationDto & {
      webhookId?: string;
      status?: string;
      eventType?: string;
    },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      const where = {
        organizationId: ctx.organizationId,
        ...(pagination.webhookId ? { webhookId: pagination.webhookId } : {}),
        ...(pagination.status ? { status: pagination.status } : {}),
        ...(pagination.eventType ? { eventType: pagination.eventType } : {}),
      };

      const [rows, total] = await Promise.all([
        tx.webhookDelivery.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            webhook: { select: { id: true, name: true, url: true } },
          },
        }),
        tx.webhookDelivery.count({ where }),
      ]);

      return {
        data: rows,
        meta: {
          page, limit, total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
        },
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Validate a webhook URL for SSRF prevention.
   * Blocks private IP ranges, loopback, link-local, and non-HTTP(S) schemes.
   */
  private validateUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Invalid URL: ${url}` },
      });
    }

    // Only allow HTTP/HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Webhook URL must use HTTP or HTTPS' },
      });
    }

    // Check hostname against SSRF patterns
    const hostname = parsed.hostname;
    for (const pattern of WebhooksService.SSRF_BLOCKED_PATTERNS) {
      if (pattern.test(hostname)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `Webhook URL blocked (SSRF prevention): private/loopback IP ${hostname}`,
          },
        });
      }
    }

    // Block localhost
    if (hostname === 'localhost') {
      throw new BadRequestException({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Webhook URL cannot point to localhost (SSRF prevention)',
        },
      });
    }
  }

  /**
   * Handle a delivery failure — increment attempt count, schedule retry
   * with exponential backoff, or dead-letter if max attempts exceeded.
   */
  private async handleDeliveryFailure(
    delivery: { id: string; attemptCount: number; maxAttempts: number; firstAttemptAt: Date | null },
    responseStatus: number | null,
    errorMessage: string,
  ): Promise<void> {
    const newAttemptCount = delivery.attemptCount + 1;

    if (newAttemptCount >= delivery.maxAttempts) {
      // Max attempts exceeded — dead-letter
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'dead_letter',
          attemptCount: newAttemptCount,
          responseStatus,
          errorMessage: errorMessage.slice(0, 1000),
          firstAttemptAt: delivery.firstAttemptAt ?? new Date(),
          completedAt: new Date(),
          nextRetryAt: null,
        },
      });
      this.logger.warn(
        `Webhook delivery ${delivery.id} dead-lettered after ${newAttemptCount} attempts: ${errorMessage}`,
      );
    } else {
      // Schedule retry with exponential backoff
      // backoff = base * 2^(attempt-1) → 5s, 10s, 20s, 40s, 80s
      const backoffMs = WebhooksService.RETRY_BASE_MS * Math.pow(2, newAttemptCount - 1);
      const nextRetryAt = new Date(Date.now() + backoffMs);

      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          attemptCount: newAttemptCount,
          responseStatus,
          errorMessage: errorMessage.slice(0, 1000),
          firstAttemptAt: delivery.firstAttemptAt ?? new Date(),
          nextRetryAt,
        },
      });

      this.logger.debug(
        `Webhook delivery ${delivery.id} failed (attempt ${newAttemptCount}/${delivery.maxAttempts}), retry at ${nextRetryAt.toISOString()}`,
      );
    }
  }
}
