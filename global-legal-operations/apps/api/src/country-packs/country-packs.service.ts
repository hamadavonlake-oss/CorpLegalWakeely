import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../database/prisma.service';
import { TenantTransactionService } from '../database/tenant-transaction.service';
import { ERROR_CODES } from '@glo/shared';

/** Shape of a valid country pack manifest.json */
export interface CountryPackManifest {
  pack_id: string;
  country_code: string;
  version: string;
  compatibility: string;
  name?: string;
  name_en?: string;
  default_locale?: string;
  default_currency?: string;
  default_timezone?: string;
  [key: string]: unknown;
}

/** Parsed pack data returned to callers */
export interface CountryPackData {
  manifest: CountryPackManifest;
  path: string;
}

@Injectable()
export class CountryPacksService {
  private readonly logger = new Logger(CountryPacksService.name);

  /** Base path for country packs: monorepo root / packages/country-packs */
  private readonly packsBasePath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
  ) {
    // Resolve relative to the monorepo root (3 levels up from api/src/country-packs)
    this.packsBasePath = path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'country-packs');
  }

  // ─── Public API ──────────────────────────────────────────────

  /**
   * Read and validate a specific country pack's manifest.json.
   */
  async loadCountryPack(countryCode: string): Promise<CountryPackData> {
    const manifestPath = path.join(this.packsBasePath, countryCode, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      throw new NotFoundException({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: `Country pack not found for code: ${countryCode}`,
        },
      });
    }

    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);

      if (!this.validateManifest(parsed)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `Invalid manifest structure for country pack: ${countryCode}`,
          },
        });
      }

      this.logger.debug(`Loaded country pack: ${countryCode} v${parsed.version}`);

      return {
        manifest: parsed,
        path: path.dirname(manifestPath),
      };
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        throw err;
      }

      this.logger.error(`Failed to read manifest for ${countryCode}`, err);
      throw new InternalServerErrorException({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to load country pack manifest',
        },
      });
    }
  }

  /**
   * Activate a country pack for an organization.
   * Sets org.countryPack and updates org settings with pack defaults.
   *
   * Phase 1: Signature verification is deferred.
   */
  async activateCountryPack(
    organizationId: string,
    countryCode: string,
  ) {
    // Load and validate the pack
    const pack = await this.loadCountryPack(countryCode);

    // Verify the organization exists
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
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

    // Build settings update from pack defaults
    const settingsUpdate: Record<string, unknown> = {};

    if (pack.manifest.default_locale) {
      settingsUpdate.defaultLocale = pack.manifest.default_locale;
    }
    if (pack.manifest.default_currency) {
      settingsUpdate.defaultCurrency = pack.manifest.default_currency;
    }
    if (pack.manifest.default_timezone) {
      settingsUpdate.defaultTimezone = pack.manifest.default_timezone;
    }

    return this.tenantTx.runInTenantContext(organizationId, async (prisma) => {
      // Update org's countryPack
      await prisma.organization.update({
        where: { id: organizationId },
        data: { countryPack: countryCode },
      });

      // Update org settings with pack defaults
      if (Object.keys(settingsUpdate).length > 0) {
        await prisma.organizationSetting.upsert({
          where: { organizationId },
          create: {
            organizationId,
            defaultLocale: (settingsUpdate.defaultLocale as string) ?? 'ar',
            defaultTimezone: (settingsUpdate.defaultTimezone as string) ?? 'Asia/Amman',
            defaultCurrency: (settingsUpdate.defaultCurrency as string) ?? 'JOD',
            mfaMandatory: false,
          },
          update: settingsUpdate,
        });
      }

      this.logger.log(
        `Country pack activated: orgId=${organizationId} pack=${countryCode} v${pack.manifest.version}`,
      );

      return {
        organizationId,
        countryPack: countryCode,
        version: pack.manifest.version,
        settingsApplied: settingsUpdate,
      };
    });
  }

  /**
   * Scan the packages/country-packs directory and list all valid packs.
   */
  async listAvailablePacks(): Promise<CountryPackData[]> {
    const packs: CountryPackData[] = [];

    if (!fs.existsSync(this.packsBasePath)) {
      this.logger.warn(`Country packs directory not found: ${this.packsBasePath}`);
      return packs;
    }

    let entries: string[];
    try {
      entries = fs.readdirSync(this.packsBasePath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch (err) {
      this.logger.error('Failed to read country packs directory', err);
      return packs;
    }

    for (const code of entries) {
      try {
        const pack = await this.loadCountryPack(code);
        packs.push(pack);
      } catch {
        // Skip invalid packs silently
        this.logger.warn(`Skipping invalid pack: ${code}`);
      }
    }

    return packs;
  }

  /**
   * Type-guard that validates the raw parsed JSON against the manifest schema.
   *
   * Required fields: pack_id, country_code, version, compatibility
   */
  validateManifest(manifest: unknown): manifest is CountryPackManifest {
    if (typeof manifest !== 'object' || manifest === null) {
      return false;
    }

    const m = manifest as Record<string, unknown>;

    return (
      typeof m.pack_id === 'string' && m.pack_id.length > 0 &&
      typeof m.country_code === 'string' && m.country_code.length > 0 &&
      typeof m.version === 'string' && m.version.length > 0 &&
      typeof m.compatibility === 'string' && m.compatibility.length > 0
    );
  }
}
