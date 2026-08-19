import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { OrganizationsService } from '../organizations.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { ERROR_CODES, DEFAULT_LOCALE, DEFAULT_TIMEZONE, DEFAULT_CURRENCY } from '@glo/shared';

const mockPrisma = {
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

const mockTenantTx = {
  runInTenantContext: jest.fn((_orgId: string, fn: (p: unknown) => Promise<unknown>) => fn(mockPrisma)),
};

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TenantTransactionService, useValue: mockTenantTx },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  // ─── 1. Find One - Success ─────────────────────────────────
  it('should return organization with settings', async () => {
    const mockOrg = { id: 'org-1', name: 'Test', settingsRel: { defaultLocale: 'ar' } };
    mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);

    const result = await service.findOne('org-1');
    expect(result).toBe(mockOrg);
    expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ include: { settingsRel: true } }),
    );
  });

  // ─── 2. Find One - Not Found ──────────────────────────────
  it('should throw NotFoundException when org not found', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  // ─── 3. Update with Optimistic Locking ─────────────────────
  it('should throw ConflictException on version mismatch', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      rowVersion: 5,
    });

    await expect(
      service.updateOrg('org-1', { name: 'New Name', rowVersion: 3 }),
    ).rejects.toThrow(ConflictException);
  });

  // ─── 4. Update Settings - Success ──────────────────────────
  it('should update organization settings', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      countryPack: 'JO',
    });
    mockPrisma.locale.findFirst.mockResolvedValue({ id: 'l1', code: 'ar' });
    mockPrisma.currency.findUnique.mockResolvedValue({ id: 'c1', code: 'JOD', isActive: true });
    mockPrisma.organizationSetting.upsert.mockResolvedValue({
      id: 's1',
      defaultLocale: 'ar',
      defaultCurrency: 'JOD',
    });

    const result = await service.updateSettings('org-1', {
      defaultLocale: 'ar',
      defaultCurrency: 'JOD',
    });

    expect(result).toBeDefined();
    expect(mockPrisma.organizationSetting.upsert).toHaveBeenCalled();
  });

  // ─── 5. Create Entity - Validates Country ──────────────────
  it('should throw BadRequestException for invalid country code', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
    mockPrisma.country.findUnique.mockResolvedValue(null);

    await expect(
      service.createEntity('org-1', {
        name: 'Test Entity',
        countryCode: 'XX',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ─── 6. Create Department - Validates Entity Ownership ────
  it('should throw NotFoundException when entity belongs to different org', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
    mockPrisma.entity.findFirst.mockResolvedValue(null); // not found

    await expect(
      service.createDepartment('org-1', 'entity-1', { name: 'Test Dept' }),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── 7. List Entities - Pagination ────────────────────────
  it('should return paginated entities', async () => {
    mockPrisma.entity.findMany.mockResolvedValue([
      { id: 'e1', name: 'Entity 1' },
      { id: 'e2', name: 'Entity 2' },
    ]);
    mockPrisma.entity.count.mockResolvedValue(2);

    const result = await service.listEntities('org-1', {
      page: 1,
      limit: 10,
    });

    expect(result.data).toHaveLength(2);
    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
      hasNext: false,
    });
  });

  // ─── 8. Create Entity - Success ─────────────────────────────
  it('should create entity successfully', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
    mockPrisma.country.findUnique.mockResolvedValue({ id: 'JO', code: 'JO', isActive: true });
    mockPrisma.entity.create.mockResolvedValue({
      id: 'e1',
      name: 'Test Entity',
      countryCode: 'JO',
    });

    const result = await service.createEntity('org-1', {
      name: 'Test Entity',
      countryCode: 'JO',
    });

    expect(result.id).toBe('e1');
    expect(mockPrisma.entity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org-1', countryCode: 'JO' }),
      }),
    );
  });
});
