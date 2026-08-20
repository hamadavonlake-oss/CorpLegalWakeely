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
import { LegalRequestStatus } from '@glo/shared';

const TRANSITION_OPTIONS: Record<string, LegalRequestStatus[]> = {
  draft: [LegalRequestStatus.submitted, LegalRequestStatus.cancelled],
  submitted: [LegalRequestStatus.triaged, LegalRequestStatus.rejected, LegalRequestStatus.waiting_for_information, LegalRequestStatus.cancelled],
  triaged: [LegalRequestStatus.in_progress, LegalRequestStatus.waiting_for_information, LegalRequestStatus.closed, LegalRequestStatus.cancelled],
  in_progress: [LegalRequestStatus.converted_to_matter, LegalRequestStatus.waiting_for_information, LegalRequestStatus.closed, LegalRequestStatus.cancelled],
  waiting_for_information: [LegalRequestStatus.triaged, LegalRequestStatus.in_progress, LegalRequestStatus.cancelled],
  converted_to_matter: [], closed: [], cancelled: [], rejected: [],
};

interface LegalRequestDetail {
  id: string; requestNumber: string; title: string; titleEn?: string; description?: string;
  type?: string; priority: string; status: string; classification: string;
  createdAt: string; updatedAt: string; requestedBy: string; assignedTo?: string;
  matterLinks?: Array<{ matter: { id: string; matterNumber: string; title: string } }>;
}

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const locale = useLocale();
  const tc = useTranslations('common');
  const { data: request, isLoading, error, mutate } = useApi<LegalRequestDetail>(`/legal-requests/${id}`);
  const [transitionTo, setTransitionTo] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState('');

  const handleTransition = async () => {
    if (!transitionTo || !request) return;
    setTransitioning(true); setTransitionError('');
    try {
      await api.post(`/legal-requests/${id}/transition`, { to: transitionTo });
      await mutate(); setTransitionTo('');
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : 'Transition failed');
    } finally { setTransitioning(false); }
  };

  if (isLoading) return <p className="text-[var(--muted-foreground)]">{tc('loading')}</p>;
  if (error) return <p className="text-[var(--destructive)]">{error.message}</p>;
  if (!request) return <p>Not found</p>;
  const allowedTransitions = TRANSITION_OPTIONS[request.status] ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{locale === 'ar' ? request.title : (request.titleEn || request.title)}</h1>
            <Badge variant={statusToVariant(request.status)}>{request.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{request.requestNumber}</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>{locale === 'ar' ? 'رجوع' : 'Back'}</Button>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'الوصف' : 'Description'}</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{request.description || (locale === 'ar' ? 'لا يوجد وصف' : 'No description')}</p></CardContent>
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
          {request.matterLinks && request.matterLinks.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'القضايا المرتبطة' : 'Linked Matters'}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {request.matterLinks.map((link) => (
                  <a key={link.matter.id} href={`/matters/${link.matter.id}`} className="block rounded p-2 hover:bg-[var(--muted)]">
                    <span className="font-medium">{link.matter.matterNumber}</span>
                    <span className="ml-2 text-sm text-[var(--muted-foreground)]">{link.matter.title}</span>
                  </a>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'معلومات' : 'Information'}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="text-[var(--muted-foreground)]">Type: </span><span>{request.type || '—'}</span></div>
            <div><span className="text-[var(--muted-foreground)]">Priority: </span><Badge variant="outline">{request.priority}</Badge></div>
            <div><span className="text-[var(--muted-foreground)]">Classification: </span><Badge variant="outline">{request.classification}</Badge></div>
            <div><span className="text-[var(--muted-foreground)]">Created: </span><span>{new Date(request.createdAt).toLocaleString()}</span></div>
            <div><span className="text-[var(--muted-foreground)]">Updated: </span><span>{new Date(request.updatedAt).toLocaleString()}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
