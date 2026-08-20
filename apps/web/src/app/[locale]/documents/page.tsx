'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusToVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { useApi } from '@/lib/use-api';

interface PaginatedResponse<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean }; }
interface Document {
  id: string; documentNumber: string; title: string; titleEn?: string;
  type: string; status: string; classification: string;
  mimeType?: string; sizeBytes?: number; contentHash?: string;
  currentVersion: number; legalHold: boolean;
  createdAt: string; updatedAt: string;
}

const STATUS_OPTIONS = ['draft','under_review','changes_requested','approved','exported','filed','archived'];
const TYPE_OPTIONS = ['contract_draft','signed_contract','exhibit','evidence','correspondence','memo','other'];

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const t = useTranslations('common');
  const locale = useLocale();
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const queryParams = new URLSearchParams({ page: String(page), limit: '20' });
  if (statusFilter) queryParams.set('status', statusFilter);
  if (typeFilter) queryParams.set('type', typeFilter);
  const { data, isLoading, error } = useApi<PaginatedResponse<Document>>(`/documents?${queryParams.toString()}`);
  const documents = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{locale === 'ar' ? 'المستندات' : 'Documents'}</h1>
        <Link href="/documents/new"><Button>{locale === 'ar' ? 'مستند جديد' : 'New Document'}</Button></Link>
      </div>

      <div className="flex gap-4">
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-48">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="w-48">
          <option value="">All Types</option>
          {TYPE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {locale === 'ar' ? 'جميع المستندات' : 'All Documents'}
            <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">({data?.meta.total ?? 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t('loading')}</p>
          ) : error ? (
            <p className="text-sm text-[var(--destructive)]">{error.message}</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t('noResults')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="pb-2 pr-4 font-medium">Number</th>
                    <th className="pb-2 pr-4 font-medium">Title</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Version</th>
                    <th className="pb-2 pr-4 font-medium">Size</th>
                    <th className="pb-2 pr-4 font-medium">Hold</th>
                    <th className="pb-2 pr-4 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id} className="border-b border-[var(--border)] hover:bg-[var(--muted)]">
                      <td className="py-3 pr-4">
                        <Link href={`/documents/${doc.id}`} className="text-[var(--primary)] hover:underline">
                          {doc.documentNumber}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">{locale === 'ar' ? doc.title : (doc.titleEn || doc.title)}</td>
                      <td className="py-3 pr-4 text-[var(--muted-foreground)]">{doc.type}</td>
                      <td className="py-3 pr-4"><Badge variant={statusToVariant(doc.status)}>{doc.status}</Badge></td>
                      <td className="py-3 pr-4">v{doc.currentVersion}</td>
                      <td className="py-3 pr-4 text-[var(--muted-foreground)]">{formatBytes(doc.sizeBytes)}</td>
                      <td className="py-3 pr-4">
                        {doc.legalHold && <Badge variant="error">HOLD</Badge>}
                      </td>
                      <td className="py-3 pr-4 text-[var(--muted-foreground)]">{new Date(doc.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && data.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-[var(--muted-foreground)]">Page {data.meta.page} of {data.meta.totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={!data.meta.hasNext} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
