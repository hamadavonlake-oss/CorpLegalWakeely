'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { useApi } from '@/lib/use-api';

interface PaginatedResponse<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean }; }
interface AuditEntry {
  id: string;
  actorId: string;
  actorEmail?: string;
  action: string;
  objectType: string;
  objectId: string;
  correlationId: string;
  ipAddress?: string;
  createdAt: string;
  hashChain?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
}

export default function AuditPage() {
  const t = useTranslations('common');
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [objectType, setObjectType] = useState('');
  const [objectId, setObjectId] = useState('');
  const [actorId, setActorId] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const queryParams = new URLSearchParams({ page: String(page), limit: '50' });
  if (objectType) queryParams.set('objectType', objectType);
  if (objectId) queryParams.set('objectId', objectId);
  if (actorId) queryParams.set('actorId', actorId);

  const { data, isLoading, error } = useApi<PaginatedResponse<AuditEntry>>(
    `/audit?${queryParams.toString()}`,
  );
  const entries = data?.data ?? [];

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const actionVariant: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
    create: 'success',
    update: 'info',
    delete: 'error',
    approve: 'success',
    reject: 'error',
    sign: 'success',
    login: 'info',
    logout: 'info',
    upload: 'info',
    download: 'info',
    export: 'info',
    legal_hold: 'warning',
    retention: 'warning',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{locale === 'ar' ? 'سجل التدقيق' : 'Audit Log'}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {locale === 'ar' ? 'سجل كامل لجميع الإجراءات مع سلسلة تجزئة tamper-evident' : 'Complete record of all actions with tamper-evident hash chain'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select value={objectType} onChange={(e) => { setObjectType(e.target.value); setPage(1); }} className="w-48">
          <option value="">All Types</option>
          <option value="legal_request">Legal Request</option>
          <option value="matter">Matter</option>
          <option value="contract">Contract</option>
          <option value="document">Document</option>
          <option value="conflict_check">Conflict Check</option>
          <option value="approval_instance">Approval Instance</option>
          <option value="approval_instance_step">Approval Step</option>
        </Select>
        <Input
          value={objectId}
          onChange={(e) => { setObjectId(e.target.value); setPage(1); }}
          placeholder="Object ID…"
          className="w-48"
        />
        <Input
          value={actorId}
          onChange={(e) => { setActorId(e.target.value); setPage(1); }}
          placeholder="Actor ID…"
          className="w-48"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {locale === 'ar' ? 'الإدخالات' : 'Entries'}
            <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">({data?.meta.total ?? 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t('loading')}</p>
          ) : error ? (
            <p className="text-sm text-[var(--destructive)]">{error.message}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t('noResults')}</p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => {
                const isExpanded = expanded.has(entry.id);
                return (
                  <div
                    key={entry.id}
                    className="rounded border border-[var(--border)] p-3 hover:bg-[var(--muted)] transition-colors cursor-pointer"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={actionVariant[entry.action] ?? 'default'}>
                            {entry.action}
                          </Badge>
                          <span className="text-sm font-medium">{entry.objectType}</span>
                          <span className="text-xs text-[var(--muted-foreground)] font-mono">
                            {entry.correlationId}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {entry.actorEmail || entry.actorId} · {new Date(entry.createdAt).toLocaleString()}
                          {entry.ipAddress && ` · IP: ${entry.ipAddress}`}
                        </p>
                        {entry.hashChain && (
                          <p className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">
                            🔗 {entry.hashChain.slice(0, 16)}…
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        {entry.beforeState && (
                          <div>
                            <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)] mb-1">Before</p>
                            <pre className="rounded bg-[var(--muted)] p-2 text-xs overflow-x-auto">
                              {JSON.stringify(entry.beforeState, null, 2)}
                            </pre>
                          </div>
                        )}
                        {entry.afterState && (
                          <div>
                            <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)] mb-1">After</p>
                            <pre className="rounded bg-[var(--muted)] p-2 text-xs overflow-x-auto">
                              {JSON.stringify(entry.afterState, null, 2)}
                            </pre>
                          </div>
                        )}
                        {!entry.beforeState && !entry.afterState && (
                          <p className="text-sm text-[var(--muted-foreground)]">
                            {locale === 'ar' ? 'لا توجد تغييرات في الحالة' : 'No state changes recorded'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
