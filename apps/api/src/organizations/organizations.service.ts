import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantTransactionService } from '../database/tenant-transaction.service';
import { ERROR_CODES, DEFAULT_LOCALE, DEFAULT_TIMEZONE, DEFAULT_CURRENCY } from '@glo/shared';
import type { PaginationDto } from '@glo/shared';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
  ) {}

  // ─── Organization CRUD ──────────────────────────────────────

  async createOrg(data: {
    name: string;
    nameEn?: string;
    slug: string;
    countryPack?: string;
  }) {
    return this.tenantTx.runInTenantContext(data.slug, async (prisma) => {
      // Check slug uniqueness
      const existing = await prisma.organization.findUnique({
        where: { slug: data.slug },
      });
      if (existing) {
        throw new ConflictException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Organization slug already exists',
          },
        });
      }

      const org = await prisma.organization.create({
        data: {
          name: data.name,
          nameEn: data.nameEn,
          slug: data.slug,
          countryPack: data.countryPack,
          settingsRel: {
            create: {
              defaultLocale: DEFAULT_LOCALE,
              defaultTimezone: DEFAULT_TIMEZONE,
              defaultCurrency: DEFAULT_CURRENCY,
            },
          },
        },
        include: { settingsRel: true },
      });

      this.logger.log(`Organization created: id=${org.id} slug=${org.slug}`);
      return org;
    });
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { settingsRel: true },
    });

    if (!org) {
      throw new NotFoundException({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Organization not found',
        },
      });
    }

    return org;
  }

  async updateOrg(
    id: string,
    data: { name?: string; nameEn?: string; slug?: string; rowVersion?: number },
  ) {
    const existing = await this.prisma.organization.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Organization not found',
        },
      });
    }

    // Optimistic locking via rowVersion
    if (data.rowVersion !== undefined && data.rowVersion !== existing.rowVersion) {
      throw new ConflictException({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Organization was modified by another user. Please refresh and try again.',
          details: {
            expectedVersion: existing.rowVersion,
            providedVersion: data.rowVersion,
          },
        },
      });
    }

    const { rowVersion: _rv, ...updateData } = data;

    const org = await this.prisma.organization.update({
      where: { id },
      data: updateData,
      include: { settingsRel: true },
    });

    this.logger.log(`Organization updated: id=${org.id}`);
    return org;
  }

  async updateSettings(
    id: string,
    data: {
      defaultLocale?: string;
      defaultTimezone?: string;
      defaultCurrency?: string;
      mfaMandatory?: boolean;
    },
  ) {
    // Verify org exists
    const org = await this.prisma.organization.findUnique({
      where: { id },
    });

    if (!org) {
      throw new NotFoundException({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Organization not found',
        },
      });
    }

    // Validate references if provided
    if (data.defaultLocale) {
      await this.validateLocaleCode(id, data.defaultLocale);
    }
    if (data.defaultCurrency) {
      await this.validateCurrencyCode(data.defaultCurrency);
    }

    const settings = await this.prisma.organizationSetting.upsert({
      where: { organizationId: id },
      create: {
        organizationId: id,
        defaultLocale: data.defaultLocale ?? DEFAULT_LOCALE,
        defaultTimezone: data.defaultTimezone ?? DEFAULT_TIMEZONE,
        defaultCurrency: data.defaultCurrency ?? DEFAULT_CURRENCY,
        mfaMandatory: data.mfaMandatory ?? false,
      },
      update: data,
    });

    this.logger.log(`Organization settings updated: orgId=${id}`);
    return settings;
  }

  // ─── Entities ────────────────────────────────────────────────

  async createEntity(
    orgId: string,
    data: {
      name: string;
      nameEn?: string;
      legalName?: string;
      registrationNo?: string;
      countryCode: string;
      entityType?: string;
    },
  ) {
    // Validate org exists
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Organization not found',
        },
      });
    }

    // Validate country code
    await this.validateCountryCode(data.countryCode);

    const entity = await this.prisma.entity.create({
      data: {
        organizationId: orgId,
        name: data.name,
        nameEn: data.nameEn,
        legalName: data.legalName,
        registrationNo: data.registrationNo,
        countryCode: data.countryCode,
        entityType: data.entityType,
      },
    });

    this.logger.log(`Entity created: id=${entity.id} orgId=${orgId}`);
    return entity;
  }

  async listEntities(orgId: string, pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;

    const [entities, total] = await Promise.all([
      this.prisma.entity.findMany({
        where: { organizationId: orgId, deletedAt: null },
        skip,
        take: limit,
        orderBy: pagination.sortBy
          ? { [pagination.sortBy]: pagination.sortOrder ?? 'desc' }
          : { createdAt: 'desc' },
      }),
      this.prisma.entity.count({
        where: { organizationId: orgId, deletedAt: null },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: entities,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
      },
    };
  }

  // ─── Departments ─────────────────────────────────────────────

  async createDepartment(
    orgId: string,
    entityId: string,
    data: { name: string; nameEn?: string },
  ) {
    // Verify org exists
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Organization not found',
        },
      });
    }

    // Verify entity belongs to org
    const entity = await this.prisma.entity.findFirst({
      where: { id: entityId, organizationId: orgId, deletedAt: null },
    });

    if (!entity) {
      throw new NotFoundException({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Entity not found or does not belong to this organization',
        },
      });
    }

    const department = await this.prisma.department.create({
      data: {
        organizationId: orgId,
        entityId,
        name: data.name,
        nameEn: data.nameEn,
      },
    });

    this.logger.log(`Department created: id=${department.id} orgId=${orgId}`);
    return department;
  }

  async listDepartments(orgId: string, pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;

    const [departments, total] = await Promise.all([
      this.prisma.department.findMany({
        where: { organizationId: orgId },
        skip,
        take: limit,
        orderBy: pagination.sortBy
          ? { [pagination.sortBy]: pagination.sortOrder ?? 'desc' }
          : { createdAt: 'desc' },
      }),
      this.prisma.department.count({
        where: { organizationId: orgId },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: departments,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
      },
    };
  }

  // ─── Validation Helpers ──────────────────────────────────────

  async validateCountryCode(code: string): Promise<void> {
    const country = await this.prisma.country.findUnique({
      where: { code },
    });

    if (!country || !country.isActive) {
      throw new BadRequestException({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: `Invalid or inactive country code: ${code}`,
        },
      });
    }
  }

  async validateCurrencyCode(code: string): Promise<void> {
    const currency = await this.prisma.currency.findUnique({
      where: { code },
    });

    if (!currency || !currency.isActive) {
      throw new BadRequestException({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: `Invalid or inactive currency code: ${code}`,
        },
      });
    }
  }

  async validateLocaleCode(orgId: string, code: string): Promise<void> {
    // Get org's country pack or country
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { countryPack: true },
    });

    if (!org) {
      throw new NotFoundException({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Organization not found',
        },
      });
    }

    // Use countryPack as countryCode for locale lookup, or derive from org entities
    const countryCode = org.countryPack;

    if (!countryCode) {
      throw new BadRequestException({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'No country pack configured for this organization',
        },
      });
    }

    const locale = await this.prisma.locale.findFirst({
      where: { countryCode, code, isActive: true },
    });

    if (!locale) {
      throw new BadRequestException({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: `Invalid or inactive locale code: ${code} for country: ${countryCode}`,
        },
      });
    }
  }
}
