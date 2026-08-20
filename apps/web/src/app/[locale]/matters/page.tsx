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
interface Matter { id: string; matterNumber: string; title: string; titleEn?: string; status: string; priority: string; type?: string; createdAt: string; }

const STATUS_OPTIONS = ['open','in_progress','on_hold','waiting_for_information','resolved','closed','archived','cancelled'];

export default function MattersPage() {
  const t = useTranslations('common');
  const locale = useLocale();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const queryParams = new URLSearchParams({ page: String(page), limit: '20' });
  if (statusFilter) queryParams.set('status', statusFilter);
  const { data, isLoading, error } = useApi<PaginatedResponse<Matter>>(`/matters?${queryParams.toString()}`);
  const matters = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{locale === 'ar' ? 'القضايا' : 'Matters'}</h1>
      </div>
      <div className="flex gap-4">
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-48">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{locale === 'ar' ? 'جميع القضايا' : 'All Matters'}<span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">({data?.meta.total ?? 0})</span></CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-[var(--muted-foreground)]">{t('loading')}</p>
           : error ? <p className="text-sm text-[var(--destructive)]">{error.message}</p>
           : matters.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">{t('noResults')}</p>
           : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="pb-2 pr-4 font-medium">Number</th>
                    <th className="pb-2 pr-4 font-medium">Title</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Priority</th>
                    <th className="pb-2 pr-4 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {matters.map((m) => (
                    <tr key={m.id} className="border-b border-[var(--border)] hover:bg-[var(--muted)]">
                      <td className="py-3 pr-4"><Link href={`/matters/${m.id}`} className="text-[var(--primary)] hover:underline">{m.matterNumber}</Link></td>
                      <td className="py-3 pr-4">{locale === 'ar' ? m.title : (m.titleEn || m.title)}</td>
                      <td className="py-3 pr-4"><Badge variant={statusToVariant(m.status)}>{m.status}</Badge></td>
                      <td className="py-3 pr-4">{m.priority}</td>
                      <td className="py-3 pr-4 text-[var(--muted-foreground)]">{new Date(m.createdAt).toLocaleDateString()}</td>
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
