import { RoleCode } from '@glo/shared';

/**
 * Mock user payload as returned by JwtStrategy.validate().
 */
export function makeMockJwtPayload(overrides?: Partial<{
  sub: string;
  organizationId: string;
  email: string;
  roles: RoleCode[];
  mfaEnabled: boolean;
}>) {
  return {
    sub: '11111111-1111-1111-1111-111111111111',
    organizationId: '22222222-2222-2222-2222-222222222222',
    email: 'test@example.com',
    roles: [RoleCode.enterprise_owner] as RoleCode[],
    mfaEnabled: false,
    ...overrides,
  };
}

/**
 * Create a mock ExecutionContext for HTTP requests.
 */
export function makeMockExecutionContext(request: Record<string, unknown> = {}) {
  const mockRequest = {
    method: 'GET',
    path: '/api/v1/test',
    user: undefined,
    tenantContext: undefined,
    headers: {},
    ...request,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
      getResponse: () => ({}),
      getNext: () => jest.fn(),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    getType: () => 'http',
    getArgs: () => [],
    getArgByIndex: () => null,
    switchToRpc: () => ({}),
    switchToWs: () => ({}),
  } as unknown as import('@nestjs/common').ExecutionContext;
}

/**
 * Mock PrismaService with all methods used by our services.
 * Extend as needed per test.
 */
export function makeMockPrismaService() {
  return {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(undefined),
        organization: {
          create: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          upsert: jest.fn(),
        },
        organizationSetting: {
          upsert: jest.fn(),
        },
        entity: {
          create: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
        },
        department: {
          create: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
        },
        user: {
          create: jest.fn(),
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
        authSession: {
          create: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
        },
        role: {
          create: jest.fn(),
          findMany: jest.fn(),
        },
        rolePermission: {
          count: jest.fn(),
        },
        country: {
          findUnique: jest.fn(),
        },
        currency: {
          findUnique: jest.fn(),
        },
        locale: {
          findFirst: jest.fn(),
        },
      };
      return fn(mockTx);
    }),
    organization: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    organizationSetting: {
      upsert: jest.fn(),
    },
    entity: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    department: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    user: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    authSession: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    role: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    rolePermission: {
      count: jest.fn(),
    },
    country: {
      findUnique: jest.fn(),
    },
    currency: {
      findUnique: jest.fn(),
    },
    locale: {
      findFirst: jest.fn(),
    },
    healthCheck: jest.fn().mockResolvedValue({ up: true, latencyMs: 5 }),
  };
}
