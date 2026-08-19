import { Test, TestingModule } from '@nestjs/testing';
import { TenantTransactionService } from '../tenant-transaction.service';
import { PrismaService } from '../prisma.service';

/**
 * Tests for TenantTransactionService — the RLS activation wrapper.
 *
 * These tests verify that:
 *   1. runInTenantContext executes the callback inside a $transaction
 *   2. The callback receives a tx client with $executeRaw for SET_CONFIG
 *   3. The session variable `app.current_organization_id` is set per call
 *   4. Different organizations get different contexts (no cross-tenant leakage)
 *
 * NOTE: These are unit tests with a mock PrismaService. Full RLS verification
 * requires a real PostgreSQL instance (Docker) with the migration applied.
 * The migration SQL is at:
 *   prisma/migrations/20260820000000_phase2_conflict_checks_rls/migration.sql
 */
describe('TenantTransactionService', () => {
  let service: TenantTransactionService;
  let executeRawMock: jest.Mock;
  let transactionMock: jest.Mock;
  let setConfigCalls: Array<{ variable: string; value: string; isLocal: boolean }>;

  beforeEach(async () => {
    setConfigCalls = [];
    executeRawMock = jest.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      // Capture the SET CONFIG call — the SQL is:
      //   SELECT set_config('app.current_organization_id', $1::text, true)
      // We detect it by checking the raw string for 'set_config'
      const sql = strings.join('');
      if (sql.includes('set_config')) {
        setConfigCalls.push({
          variable: 'app.current_organization_id',
          value: values[0] as string,
          isLocal: true,
        });
      }
      return [];
    });

    const txClient = {
      $executeRaw: executeRawMock,
    };

    transactionMock = jest.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => {
      return fn(txClient);
    });

    const prisma = {
      $transaction: transactionMock,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantTransactionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(TenantTransactionService);
  });

  describe('runInTenantContext', () => {
    it('executes the callback inside a $transaction', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      const result = await service.runInTenantContext('org-1', callback);
      expect(result).toBe('result');
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('sets the app.current_organization_id session variable before the callback', async () => {
      const callbackOrder: string[] = [];
      executeRawMock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('');
        if (sql.includes('set_config')) {
          callbackOrder.push(`set_config:${values[0]}`);
        }
        return [];
      });
      const callback = jest.fn().mockImplementation(async () => {
        callbackOrder.push('callback');
        return 'done';
      });

      await service.runInTenantContext('org-123', callback);

      // SET_CONFIG must happen BEFORE the callback runs
      expect(callbackOrder[0]).toBe('set_config:org-123');
      expect(callbackOrder[1]).toBe('callback');
    });

    it('passes the tx client (with $executeRaw) to the callback', async () => {
      const callback = jest.fn().mockImplementation(async (tx: { $executeRaw: unknown }) => {
        expect(typeof tx.$executeRaw).toBe('function');
        return 'ok';
      });
      await service.runInTenantContext('org-1', callback);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('uses is_local=true (transaction-scoped) to prevent cross-request leakage', async () => {
      await service.runInTenantContext('org-1', jest.fn().mockResolvedValue(null));
      // The SQL template includes the literal `true` for is_local
      // We verify by checking the raw SQL passed to $executeRaw
      const sqlArg = executeRawMock.mock.calls[0]?.[0] as TemplateStringsArray | undefined;
      expect(sqlArg).toBeDefined();
      const sql = sqlArg?.join('') ?? '';
      expect(sql).toContain('set_config');
      expect(sql).toContain('app.current_organization_id');
      // The `true` is the third argument to set_config — it's a literal in the SQL template
      // (not a parameter) because Prisma raw queries with tagged templates inline literals.
      // Allow whitespace between `true` and `)` since the template spans multiple lines.
      expect(sql).toMatch(/true\s*\)/);
    });

    it('different organizations get different tenant contexts (no leakage)', async () => {
      const orgsSeen: string[] = [];
      const callback = jest.fn().mockImplementation(async () => {
        // Read the captured org from set_config calls
        const lastCall = setConfigCalls[setConfigCalls.length - 1];
        if (lastCall) orgsSeen.push(lastCall.value);
        return null;
      });

      await service.runInTenantContext('org-A', callback);
      await service.runInTenantContext('org-B', callback);
      await service.runInTenantContext('org-A', callback);

      expect(orgsSeen).toEqual(['org-A', 'org-B', 'org-A']);
    });

    it('returns the callback result unchanged', async () => {
      const obj = { id: '123', name: 'test' };
      const callback = jest.fn().mockResolvedValue(obj);
      const result = await service.runInTenantContext('org-1', callback);
      expect(result).toBe(obj);
    });

    it('propagates errors from the callback', async () => {
      const error = new Error('callback failed');
      const callback = jest.fn().mockRejectedValue(error);
      await expect(
        service.runInTenantContext('org-1', callback),
      ).rejects.toThrow('callback failed');
    });
  });

  describe('debugVisibleOrganizationCount', () => {
    it('returns the count of visible rows after setting tenant context', async () => {
      // Mock $queryRaw to return count = 1
      const queryRawMock = jest.fn().mockResolvedValue([{ count: BigInt(1) }]);
      transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $executeRaw: executeRawMock,
          $queryRaw: queryRawMock,
        };
        return fn(tx);
      });

      const count = await service.debugVisibleOrganizationCount('org-1');
      expect(count).toBe(1);
      expect(executeRawMock).toHaveBeenCalled();
      expect(queryRawMock).toHaveBeenCalled();
    });
  });
});

/**
 * Architecture note:
 *
 * The RLS migration (prisma/migrations/20260820000000_phase2_conflict_checks_rls)
 * enables RLS + FORCE RLS on 14 tenant-scoped tables, and defines a
 * `tenant_isolation` policy on each:
 *
 *   USING (organization_id = current_setting('app.current_organization_id', true))
 *   WITH CHECK (organization_id = current_setting('app.current_organization_id', true))
 *
 * The `true` (is_local) flag scopes the session variable to the current
 * transaction, so two concurrent requests in different tenants cannot leak.
 *
 * Full E2E verification (Tenant A cannot read Tenant B's data) requires
 * a real PostgreSQL instance with the migration applied. This is
 * documented as a known issue (Docker unavailable in build env).
 * The unit tests above verify the application-layer contract: that
 * runInTenantContext sets the variable before every callback.
 */
