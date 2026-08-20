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
interface Contract { id: string; contractNumber: string; title: string; titleEn?: string; status: string; priority: string; type?: string; totalValue?: string; totalCurrency?: string; counterpartyName?: string; counterpartyNameEn?: string; createdAt: string; }

const STATUS_OPTIONS = ['draft','under_review','changes_requested','pending_approval','approved','pending_signature','signed','active','expired','terminated','archived','rejected','draft_new_version'];

export default function ContractsPage() {
  const t = useTranslations('common');
  const locale = useLocale();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const queryParams = new URLSearchParams({ page: String(page), limit: '20' });
  if (statusFilter) queryParams.set('status', statusFilter);
  const { data, isLoading, error } = useApi<PaginatedResponse<Contract>>(`/contracts?${queryParams.toString()}`);
  const contracts = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{locale === 'ar' ? 'العقود' : 'Contracts'}</h1>
      </div>
      <div className="flex gap-4">
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-48">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{locale === 'ar' ? 'جميع العقود' : 'All Contracts'}<span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">({data?.meta.total ?? 0})</span></CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-[var(--muted-foreground)]">{t('loading')}</p>
           : error ? <p className="text-sm text-[var(--destructive)]">{error.message}</p>
           : contracts.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">{t('noResults')}</p>
           : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="pb-2 pr-4 font-medium">Number</th>
                    <th className="pb-2 pr-4 font-medium">Title</th>
                    <th className="pb-2 pr-4 font-medium">Counterparty</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Value</th>
                    <th className="pb-2 pr-4 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id} className="border-b border-[var(--border)] hover:bg-[var(--muted)]">
                      <td className="py-3 pr-4"><Link href={`/contracts/${c.id}`} className="text-[var(--primary)] hover:underline">{c.contractNumber}</Link></td>
                      <td className="py-3 pr-4">{locale === 'ar' ? c.title : (c.titleEn || c.title)}</td>
                      <td className="py-3 pr-4 text-[var(--muted-foreground)]">{locale === 'ar' ? c.counterpartyName : (c.counterpartyNameEn || c.counterpartyName) || '—'}</td>
                      <td className="py-3 pr-4"><Badge variant={statusToVariant(c.status)}>{c.status}</Badge></td>
                      <td className="py-3 pr-4">{c.totalValue ? `${Number(c.totalValue).toLocaleString()} ${c.totalCurrency || ''}` : '—'}</td>
                      <td className="py-3 pr-4 text-[var(--muted-foreground)]">{new Date(c.createdAt).toLocaleDateString()}</td>
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
