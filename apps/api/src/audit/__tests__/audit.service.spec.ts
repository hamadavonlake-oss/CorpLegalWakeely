import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit.service';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Mock PrismaService factory for AuditService tests.
 *
 * The audit hash chain relies on a `$transaction` that:
 *   1. findFirst (most recent entry's hashChain)
 *   2. create (the new entry)
 *
 * The mock keeps an in-memory list of audit log entries to simulate
 * the chain so we can verify hash continuity and tamper detection.
 */
function makeMockPrismaWithAuditStore() {
  const store: Array<{
    id: string;
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
    hashChain: string;
    createdAt: Date;
    _seq: number; // monotonic insertion order — stable sort tiebreaker
  }> = [];

  let idCounter = 0;
  let seqCounter = 0;
  const newId = () => `audit-${++idCounter}`;

  const txMock = {
    auditLog: {
      findFirst: jest.fn(async ({ where }: { where: { organizationId: string } }) => {
        // Most recent entry for this org — sort by insertion order DESC
        // (more stable than createdAt which can collide within the same ms)
        const orgEntries = store
          .filter((e) => e.organizationId === where.organizationId)
          .sort((a, b) => b._seq - a._seq);
        return orgEntries[0] ?? null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        // Normalize Prisma.JsonNull and Prisma.DbNull to null — real Prisma
        // returns null for JSON columns stored as JsonNull/DbNull.
        const normalize = (v: unknown): unknown => {
          if (v === Prisma.JsonNull || v === Prisma.DbNull) return null;
          return v;
        };
        const entry = {
          id: newId(),
          _seq: ++seqCounter,
          organizationId: data.organizationId as string,
          actorId: data.actorId as string,
          actorEmail: (data.actorEmail as string | null) ?? null,
          action: data.action as string,
          objectType: data.objectType as string,
          objectId: data.objectId as string,
          correlationId: data.correlationId as string,
          beforeState: normalize(data.beforeState),
          afterState: normalize(data.afterState),
          ipAddress: (data.ipAddress as string | null) ?? null,
          userAgent: (data.userAgent as string | null) ?? null,
          hashChain: data.hashChain as string,
          createdAt: new Date(),
        };
        store.push(entry);
        return entry;
      }),
      findMany: jest.fn(async ({ where }: { where: { organizationId: string } }) => {
        return store
          .filter((e) => e.organizationId === where.organizationId)
          .sort((a, b) => a._seq - b._seq); // ASC = chronological
      }),
      count: jest.fn(async () => store.length),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => {
      return fn(txMock);
    }),
    auditLog: txMock.auditLog,
  };

  return { prisma, store, txMock };
}

describe('AuditService', () => {
  let service: AuditService;
  let mock: ReturnType<typeof makeMockPrismaWithAuditStore>;

  beforeEach(async () => {
    mock = makeMockPrismaWithAuditStore();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mock.prisma },
      ],
    }).compile();
    service = module.get(AuditService);
  });

  describe('append', () => {
    it('creates the genesis entry with empty prevHash', async () => {
      const entry = await service.append({
        organizationId: 'org-1',
        actorId: 'user-1',
        action: 'create',
        objectType: 'legal_request',
        objectId: 'req-1',
        correlationId: 'REQ-2026-0001',
      });

      expect(entry.hashChain).toBeTruthy();
      expect(entry.hashChain).toHaveLength(64); // SHA-256 hex length
      expect(mock.store).toHaveLength(1);
    });

    it('chains subsequent entries to the previous hash', async () => {
      const entry1 = await service.append({
        organizationId: 'org-1',
        actorId: 'user-1',
        action: 'create',
        objectType: 'legal_request',
        objectId: 'req-1',
        correlationId: 'REQ-2026-0001',
      });

      const entry2 = await service.append({
        organizationId: 'org-1',
        actorId: 'user-1',
        action: 'update',
        objectType: 'legal_request',
        objectId: 'req-1',
        correlationId: 'REQ-2026-0001',
      });

      // Verify entry2's hash incorporates entry1's hash.
      // Use the service's own computeHash (which canonicalizes JSON)
      // rather than JSON.stringify (which doesn't).
      const expectedPayload = {
        organizationId: 'org-1',
        actorId: 'user-1',
        actorEmail: null,
        action: 'update',
        objectType: 'legal_request',
        objectId: 'req-1',
        correlationId: 'REQ-2026-0001',
        beforeState: null,
        afterState: null,
        ipAddress: null,
        userAgent: null,
      };
      const expectedHash = service.computeHash(entry1.hashChain ?? '', expectedPayload);

      expect(entry2.hashChain).toBe(expectedHash);
      expect(entry2.hashChain).not.toBe(entry1.hashChain);
    });

    it('isolates chains per organization (org A and org B have independent genesis)', async () => {
      const entryOrgA = await service.append({
        organizationId: 'org-A',
        actorId: 'user-1',
        action: 'create',
        objectType: 'legal_request',
        objectId: 'req-1',
        correlationId: 'REQ-A-0001',
      });

      const entryOrgB = await service.append({
        organizationId: 'org-B',
        actorId: 'user-2',
        action: 'create',
        objectType: 'legal_request',
        objectId: 'req-2',
        correlationId: 'REQ-B-0001',
      });

      // Both should be genesis entries (different orgs, different chains)
      // But they will have different hashes because the payloads differ
      expect(entryOrgA.hashChain).not.toBe(entryOrgB.hashChain);

      // Verify org B's entry used empty prevHash (genesis for org B).
      // Use the service's own computeHash for canonical JSON.
      const expectedPayloadB = {
        organizationId: 'org-B',
        actorId: 'user-2',
        actorEmail: null,
        action: 'create',
        objectType: 'legal_request',
        objectId: 'req-2',
        correlationId: 'REQ-B-0001',
        beforeState: null,
        afterState: null,
        ipAddress: null,
        userAgent: null,
      };
      const expectedHashB = service.computeHash(AuditService.GENESIS_HASH, expectedPayloadB);
      expect(entryOrgB.hashChain).toBe(expectedHashB);
    });
  });

  describe('verifyChain', () => {
    it('returns ok=true for an intact chain', async () => {
      await service.append({
        organizationId: 'org-1', actorId: 'u1', action: 'create',
        objectType: 'legal_request', objectId: 'r1', correlationId: 'c1',
      });
      await service.append({
        organizationId: 'org-1', actorId: 'u1', action: 'update',
        objectType: 'legal_request', objectId: 'r1', correlationId: 'c1',
      });
      await service.append({
        organizationId: 'org-1', actorId: 'u1', action: 'delete',
        objectType: 'legal_request', objectId: 'r1', correlationId: 'c1',
      });

      const result = await service.verifyChain('org-1');
      expect(result.ok).toBe(true);
    });

    it('returns ok=true for an empty chain', async () => {
      const result = await service.verifyChain('org-1');
      expect(result.ok).toBe(true);
    });

    it('detects tampering: modified entry breaks the chain', async () => {
      await service.append({
        organizationId: 'org-1', actorId: 'u1', action: 'create',
        objectType: 'legal_request', objectId: 'r1', correlationId: 'c1',
      });
      await service.append({
        organizationId: 'org-1', actorId: 'u1', action: 'update',
        objectType: 'legal_request', objectId: 'r1', correlationId: 'c1',
      });

      // Tamper: modify the first entry's action
      const firstEntry = mock.store[0]!;
      firstEntry.action = 'TAMPERED';

      const result = await service.verifyChain('org-1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.brokenAtId).toBe(firstEntry.id);
        expect(result.actualHash).toBe(firstEntry.hashChain);
        expect(result.expectedHash).not.toBe(firstEntry.hashChain);
      }
    });

    it('detects tampering: modified hashChain breaks the chain at the tampered entry', async () => {
      await service.append({
        organizationId: 'org-1', actorId: 'u1', action: 'create',
        objectType: 'legal_request', objectId: 'r1', correlationId: 'c1',
      });
      await service.append({
        organizationId: 'org-1', actorId: 'u1', action: 'update',
        objectType: 'legal_request', objectId: 'r1', correlationId: 'c1',
      });

      // Tamper: change entry 0's stored hashChain to a fake value.
      // verifyChain walks entries in chronological order. For entry 0 it
      // recomputes hash('', payload0) and compares against the (now fake)
      // stored hashChain. The two won't match, so the chain breaks at entry 0.
      const firstEntry = mock.store[0]!;
      firstEntry.hashChain = 'fakehash0000000000000000000000000000000000000000000000000000ffff';

      const result = await service.verifyChain('org-1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.brokenAtId).toBe(firstEntry.id);
      }
    });
  });

  describe('computeHash', () => {
    it('produces a 64-character hex string', () => {
      const hash = service.computeHash('', { foo: 'bar' });
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('produces the same hash for the same input', () => {
      const payload = { a: 1, b: 'two' };
      const h1 = service.computeHash('prevhash', payload);
      const h2 = service.computeHash('prevhash', payload);
      expect(h1).toBe(h2);
    });

    it('produces different hashes for different payloads', () => {
      const h1 = service.computeHash('prevhash', { a: 1 });
      const h2 = service.computeHash('prevhash', { a: 2 });
      expect(h1).not.toBe(h2);
    });

    it('produces different hashes for different prevHashes', () => {
      const h1 = service.computeHash('prevhash1', { a: 1 });
      const h2 = service.computeHash('prevhash2', { a: 1 });
      expect(h1).not.toBe(h2);
    });

    it('is canonical: key order does not affect the hash', () => {
      const h1 = service.computeHash('prev', { a: 1, b: 2 });
      const h2 = service.computeHash('prev', { b: 2, a: 1 });
      expect(h1).toBe(h2);
    });

    it('is canonical: nested object key order does not affect the hash', () => {
      const h1 = service.computeHash('prev', { outer: { x: 1, y: 2 }, z: 3 });
      const h2 = service.computeHash('prev', { z: 3, outer: { y: 2, x: 1 } });
      expect(h1).toBe(h2);
    });

    it('handles arrays in canonical order (positional)', () => {
      const h1 = service.computeHash('prev', { list: [1, 2, 3] });
      const h2 = service.computeHash('prev', { list: [3, 2, 1] });
      expect(h1).not.toBe(h2); // array order matters
    });

    it('handles null values', () => {
      const h1 = service.computeHash('prev', { a: null, b: 'x' });
      const h2 = service.computeHash('prev', { b: 'x', a: null });
      expect(h1).toBe(h2);
    });

    it('handles empty objects', () => {
      const h = service.computeHash('prev', {});
      expect(h).toHaveLength(64);
    });

    it('handles the genesis empty prevHash', () => {
      const h1 = service.computeHash('', { action: 'create' });
      const h2 = service.computeHash('nonempty', { action: 'create' });
      expect(h1).not.toBe(h2);
    });
  });

  describe('GENESIS_HASH constant', () => {
    it('is an empty string', () => {
      expect(AuditService.GENESIS_HASH).toBe('');
    });
  });
});
