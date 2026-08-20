'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusToVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { useApi } from '@/lib/use-api';
import { api } from '@/lib/api-client';
import { MatterStatus } from '@glo/shared';

const TRANSITION_OPTIONS: Record<string, MatterStatus[]> = {
  open: [MatterStatus.in_progress, MatterStatus.cancelled],
  in_progress: [MatterStatus.on_hold, MatterStatus.waiting_for_information, MatterStatus.resolved, MatterStatus.cancelled],
  on_hold: [MatterStatus.in_progress, MatterStatus.cancelled],
  waiting_for_information: [MatterStatus.in_progress, MatterStatus.cancelled],
  resolved: [MatterStatus.closed, MatterStatus.cancelled],
  closed: [MatterStatus.archived],
  archived: [], cancelled: [],
};

interface MatterDetail {
  id: string; matterNumber: string; title: string; titleEn?: string; description?: string;
  type?: string; priority: string; status: string; classification: string;
  createdAt: string; updatedAt: string; assignedTo?: string; responsibleUser?: string;
  requestLinks?: Array<{ request: { id: string; requestNumber: string; title: string } }>;
}

export default function MatterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const locale = useLocale();
  const tc = useTranslations('common');
  const { data: matter, isLoading, error, mutate } = useApi<MatterDetail>(`/matters/${id}`);
  const [transitionTo, setTransitionTo] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState('');

  const handleTransition = async () => {
    if (!transitionTo || !matter) return;
    setTransitioning(true); setTransitionError('');
    try {
      await api.post(`/matters/${id}/transition`, { to: transitionTo });
      await mutate(); setTransitionTo('');
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : 'Transition failed');
    } finally { setTransitioning(false); }
  };

  if (isLoading) return <p className="text-[var(--muted-foreground)]">{tc('loading')}</p>;
  if (error) return <p className="text-[var(--destructive)]">{error.message}</p>;
  if (!matter) return <p>Not found</p>;
  const allowedTransitions = TRANSITION_OPTIONS[matter.status] ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{locale === 'ar' ? matter.title : (matter.titleEn || matter.title)}</h1>
            <Badge variant={statusToVariant(matter.status)}>{matter.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{matter.matterNumber}</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>{locale === 'ar' ? 'رجوع' : 'Back'}</Button>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'الوصف' : 'Description'}</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{matter.description || (locale === 'ar' ? 'لا يوجد وصف' : 'No description')}</p></CardContent>
          </Card>
          {allowedTransitions.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'تغيير الحالة' : 'Change Status'}</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Select value={transitionTo} onChange={(e) => setTransitionTo(e.target.value)} className="flex-1">
                    <option value="">Select new status…</option>
                    {allowedTransitions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <Button onClick={handleTransition} disabled={!transitionTo || transitioning} loading={transitioning}>{locale === 'ar' ? 'تطبيق' : 'Apply'}</Button>
                </div>
                {transitionError && <p className="mt-2 text-sm text-[var(--destructive)]">{transitionError}</p>}
              </CardContent>
            </Card>
          )}
          {matter.requestLinks && matter.requestLinks.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'الطلبات المرتبطة' : 'Linked Requests'}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {matter.requestLinks.map((link) => (
                  <a key={link.request.id} href={`/requests/${link.request.id}`} className="block rounded p-2 hover:bg-[var(--muted)]">
                    <span className="font-medium">{link.request.requestNumber}</span>
                    <span className="ml-2 text-sm text-[var(--muted-foreground)]">{link.request.title}</span>
                  </a>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'معلومات' : 'Information'}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="text-[var(--muted-foreground)]">Type: </span><span>{matter.type || '—'}</span></div>
            <div><span className="text-[var(--muted-foreground)]">Priority: </span><Badge variant="outline">{matter.priority}</Badge></div>
            <div><span className="text-[var(--muted-foreground)]">Classification: </span><Badge variant="outline">{matter.classification}</Badge></div>
            <div><span className="text-[var(--muted-foreground)]">Created: </span><span>{new Date(matter.createdAt).toLocaleString()}</span></div>
            <div><span className="text-[var(--muted-foreground)]">Updated: </span><span>{new Date(matter.updatedAt).toLocaleString()}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
