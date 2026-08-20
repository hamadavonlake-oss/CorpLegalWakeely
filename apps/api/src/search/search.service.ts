import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantTransactionService } from '../database/tenant-transaction.service';
import type { TenantContext } from '@glo/shared';

export interface SearchResult {
  id: string;
  type: 'legal_request' | 'matter' | 'contract' | 'document';
  number: string;
  title: string;
  titleEn?: string;
  status: string;
  description?: string;
  createdAt: Date;
}

interface SearchResponse {
  query: string;
  type?: string;
  results: SearchResult[];
  total: number;
}

/**
 * SearchService — tenant-scoped full-text search across all entity types.
 *
 * Uses PostgreSQL ILIKE for substring matching (case-insensitive).
 * The migration adds GIN indexes on to_tsvector columns for performance,
 * but the queries themselves use ILIKE so they work even without the indexes
 * (just slower on large datasets).
 *
 * Per ADR-003: RLS ensures tenant isolation — the TenantTransactionService
 * sets app.current_organization_id before every query, so even if a search
 * somehow tried to match another tenant's data, RLS would block it.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantTx: TenantTransactionService,
  ) {}

  async search(
    ctx: TenantContext,
    query: string,
    options?: { type?: string; limit?: number },
  ): Promise<SearchResponse> {
    const limit = Math.min(options?.limit ?? 50, 100);
    const searchQuery = query.trim();

    if (!searchQuery) {
      return { query: searchQuery, type: options?.type, results: [], total: 0 };
    }

    // Build the ILIKE pattern: %query%
    const pattern = `%${searchQuery}%`;

    const types = options?.type
      ? [options.type]
      : ['legal_request', 'matter', 'contract', 'document'];

    const results: SearchResult[] = [];

    return this.tenantTx.runInTenantContext(ctx.organizationId, async (tx) => {
      // Search legal_requests
      if (types.includes('legal_request')) {
        const requests = await tx.legalRequest.findMany({
          where: {
            organizationId: ctx.organizationId,
            deletedAt: null,
            OR: [
              { title: { contains: searchQuery, mode: 'insensitive' } },
              { titleEn: { contains: searchQuery, mode: 'insensitive' } },
              { description: { contains: searchQuery, mode: 'insensitive' } },
              { requestNumber: { contains: searchQuery, mode: 'insensitive' } },
            ],
          },
          take: limit,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true, requestNumber: true, title: true, titleEn: true,
            status: true, description: true, createdAt: true,
          },
        });
        for (const r of requests) {
          results.push({
            id: r.id, type: 'legal_request', number: r.requestNumber,
            title: r.title, titleEn: r.titleEn ?? undefined,
            status: r.status, description: r.description ?? undefined,
            createdAt: r.createdAt,
          });
        }
      }

      // Search matters
      if (types.includes('matter')) {
        const matters = await tx.matter.findMany({
          where: {
            organizationId: ctx.organizationId,
            deletedAt: null,
            OR: [
              { title: { contains: searchQuery, mode: 'insensitive' } },
              { titleEn: { contains: searchQuery, mode: 'insensitive' } },
              { description: { contains: searchQuery, mode: 'insensitive' } },
              { matterNumber: { contains: searchQuery, mode: 'insensitive' } },
            ],
          },
          take: limit,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true, matterNumber: true, title: true, titleEn: true,
            status: true, description: true, createdAt: true,
          },
        });
        for (const m of matters) {
          results.push({
            id: m.id, type: 'matter', number: m.matterNumber,
            title: m.title, titleEn: m.titleEn ?? undefined,
            status: m.status, description: m.description ?? undefined,
            createdAt: m.createdAt,
          });
        }
      }

      // Search contracts
      if (types.includes('contract')) {
        const contracts = await tx.contract.findMany({
          where: {
            organizationId: ctx.organizationId,
            deletedAt: null,
            OR: [
              { title: { contains: searchQuery, mode: 'insensitive' } },
              { titleEn: { contains: searchQuery, mode: 'insensitive' } },
              { description: { contains: searchQuery, mode: 'insensitive' } },
              { contractNumber: { contains: searchQuery, mode: 'insensitive' } },
              { counterpartyName: { contains: searchQuery, mode: 'insensitive' } },
              { counterpartyNameEn: { contains: searchQuery, mode: 'insensitive' } },
            ],
          },
          take: limit,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true, contractNumber: true, title: true, titleEn: true,
            status: true, description: true, createdAt: true,
          },
        });
        for (const c of contracts) {
          results.push({
            id: c.id, type: 'contract', number: c.contractNumber,
            title: c.title, titleEn: c.titleEn ?? undefined,
            status: c.status, description: c.description ?? undefined,
            createdAt: c.createdAt,
          });
        }
      }

      // Search documents
      if (types.includes('document')) {
        const documents = await tx.document.findMany({
          where: {
            organizationId: ctx.organizationId,
            deletedAt: null,
            OR: [
              { title: { contains: searchQuery, mode: 'insensitive' } },
              { titleEn: { contains: searchQuery, mode: 'insensitive' } },
              { description: { contains: searchQuery, mode: 'insensitive' } },
              { documentNumber: { contains: searchQuery, mode: 'insensitive' } },
            ],
          },
          take: limit,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true, documentNumber: true, title: true, titleEn: true,
            status: true, description: true, createdAt: true,
          },
        });
        for (const d of documents) {
          results.push({
            id: d.id, type: 'document', number: d.documentNumber,
            title: d.title, titleEn: d.titleEn ?? undefined,
            status: d.status, description: d.description ?? undefined,
            createdAt: d.createdAt,
          });
        }
      }

      // Sort by relevance (most recently updated first across types)
      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      this.logger.debug(
        `Search "${searchQuery}" (type=${options?.type ?? 'all'}): ${results.length} results`,
      );

      return {
        query: searchQuery,
        type: options?.type,
        results,
        total: results.length,
      };
    });
  }
}
