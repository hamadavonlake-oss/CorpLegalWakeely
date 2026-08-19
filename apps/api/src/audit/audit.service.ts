import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuditLog as PrismaAuditLog } from '@prisma/client';

/**
 * Input for a new audit log entry. The `action`, `objectType`, `objectId`
 * and `correlationId` fields are required; everything else is optional.
 */
export interface CreateAuditEntryInput {
  organizationId: string;
  actorId: string;
  actorEmail?: string;
  action: string;
  objectType: string;
  objectId: string;
  correlationId: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/** Returned by append — the persisted Prisma row. */
export type AuditLogRow = PrismaAuditLog;

/**
 * AuditService — append-only, tamper-evident audit log per ADR-013.
 *
 * Each entry stores a `hash_chain` value computed as:
 *
 *   hash = SHA-256(prevHash || canonicalJson(entry))
 *
 * Where `prevHash` is the hash_chain of the most recent existing entry
 * (within the same organization), and `canonicalJson(entry)` is the
 * deterministic JSON serialization of all entry fields EXCEPT
 * `hash_chain` itself, sorted by key.
 *
 * Tamper detection: any modification to an existing row breaks the chain
 * because the next row's stored `prevHash` would no longer match the
 * recomputed hash of the modified row.
 *
 * Genesis entry (no previous): prevHash = '' (empty string).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  // Empty string represents the genesis (no previous entry).
  static readonly GENESIS_HASH = '';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append a new audit entry and return the persisted row with its
   * computed hash_chain value.
   *
   * Two writes are performed in a single transaction:
   *   1. SELECT the most recent entry's hash_chain for this org
   *   2. INSERT the new row with hash_chain computed from prevHash + entry
   *
   * The transaction guarantees that two concurrent writers cannot both
   * observe the same prevHash (otherwise the chain would fork).
   */
  async append(input: CreateAuditEntryInput): Promise<AuditLogRow> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Get the most recent entry's hash_chain for this organization.
      const lastEntry = await tx.auditLog.findFirst({
        where: { organizationId: input.organizationId },
        orderBy: { createdAt: 'desc' },
        select: { hashChain: true },
      });
      const prevHash = lastEntry?.hashChain ?? AuditService.GENESIS_HASH;

      // 2. Build the entry payload (everything except hash_chain).
      const entryPayload = {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        objectType: input.objectType,
        objectId: input.objectId,
        correlationId: input.correlationId,
        beforeState: input.beforeState ?? null,
        afterState: input.afterState ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      };

      // 3. Compute the hash.
      const newHash = this.computeHash(prevHash, entryPayload);

      // 4. Insert with the computed hash.
      const created = await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          actorEmail: input.actorEmail ?? null,
          action: input.action,
          objectType: input.objectType,
          objectId: input.objectId,
          correlationId: input.correlationId,
          beforeState: input.beforeState
            ? (input.beforeState as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          afterState: input.afterState
            ? (input.afterState as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          hashChain: newHash,
        },
      });

      this.logger.debug(
        `Audit entry appended: action=${input.action} objectType=${input.objectType} ` +
          `objectId=${input.objectId} hash=${newHash.slice(0, 8)}…`,
      );

      return created;
    });
  }

  /**
   * Verify the hash chain for an organization's audit log.
   *
   * Walks every entry in chronological order, recomputing each hash and
   * comparing it to the stored hash_chain. Returns the first broken entry
   * id, or null if the entire chain is intact.
   *
   * Used by tenant-isolation and tamper-detection tests.
   */
  async verifyChain(
    organizationId: string,
  ): Promise<{ ok: true } | { ok: false; brokenAtId: string; expectedHash: string; actualHash: string }> {
    const entries = await this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });

    let prevHash = AuditService.GENESIS_HASH;
    for (const entry of entries) {
      const expected = this.computeHash(prevHash, this.entryToPayload(entry));
      if (expected !== entry.hashChain) {
        return {
          ok: false,
          brokenAtId: entry.id,
          expectedHash: expected,
          actualHash: entry.hashChain ?? '',
        };
      }
      prevHash = entry.hashChain ?? '';
    }
    return { ok: true };
  }

  /**
   * List audit entries for an organization, paginated.
   */
  async list(
    organizationId: string,
    options: {
      page: number;
      limit: number;
      objectType?: string;
      objectId?: string;
      actorId?: string;
    },
  ) {
    const where = {
      organizationId,
      ...(options.objectType ? { objectType: options.objectType } : {}),
      ...(options.objectId ? { objectId: options.objectId } : {}),
      ...(options.actorId ? { actorId: options.actorId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: rows,
      meta: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(total / options.limit),
      },
    };
  }

  // ─── Hash computation helpers ────────────────────────────────────

  /**
   * Compute the hash_chain value for a new entry.
   *
   *   hash = SHA-256(prevHash + '|' + canonicalJson(payload))
   *
   * Canonical JSON: keys sorted ascending, no whitespace. This makes the
   * hash deterministic regardless of object property order in JS.
   */
  computeHash(
    prevHash: string,
    payload: Record<string, unknown>,
  ): string {
    const canonical = this.canonicalJson(payload);
    const input = `${prevHash}|${canonical}`;
    return createHash('sha256').update(input, 'utf8').digest('hex');
  }

  /**
   * Deterministic JSON serialization: keys sorted ascending, no
   * insignificant whitespace, stable nested object ordering.
   */
  private canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((v) => this.canonicalJson(v)).join(',')}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((k) => `"${k}":${this.canonicalJson(obj[k])}`);
    return `{${pairs.join(',')}}`;
  }

  /**
   * Convert a persisted AuditLog row into the payload shape used for
   * hash computation. Excludes `hashChain`, `id`, `createdAt` (which
   * are system-managed and not part of the signed payload).
   */
  private entryToPayload(entry: {
    organizationId: string;
    actorId: string;
    actorEmail: string | null;
    action: string;
    objectType: string;
    objectId: string;
    correlationId: string;
    beforeState: unknown;
    afterState: unknown;
    ipAddress: string | null;
    userAgent: string | null;
  }): Record<string, unknown> {
    return {
      organizationId: entry.organizationId,
      actorId: entry.actorId,
      actorEmail: entry.actorEmail,
      action: entry.action,
      objectType: entry.objectType,
      objectId: entry.objectId,
      correlationId: entry.correlationId,
      beforeState: entry.beforeState,
      afterState: entry.afterState,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    };
  }
}
