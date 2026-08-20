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
import { ContractStatus } from '@glo/shared';

const TRANSITION_OPTIONS: Record<string, ContractStatus[]> = {
  draft: [ContractStatus.under_review, ContractStatus.archived],
  under_review: [ContractStatus.changes_requested, ContractStatus.pending_approval, ContractStatus.rejected, ContractStatus.draft],
  changes_requested: [ContractStatus.under_review, ContractStatus.draft],
  pending_approval: [ContractStatus.approved, ContractStatus.rejected, ContractStatus.changes_requested, ContractStatus.draft],
  approved: [ContractStatus.pending_signature, ContractStatus.active, ContractStatus.archived],
  pending_signature: [ContractStatus.signed, ContractStatus.archived],
  signed: [ContractStatus.active],
  active: [ContractStatus.expired, ContractStatus.terminated, ContractStatus.archived],
  expired: [ContractStatus.archived, ContractStatus.draft_new_version],
  terminated: [ContractStatus.archived],
  draft_new_version: [ContractStatus.under_review, ContractStatus.archived],
  rejected: [], archived: [],
};

interface ContractDetail {
  id: string; contractNumber: string; title: string; titleEn?: string; description?: string;
  type?: string; category?: string; priority: string; status: string; classification: string;
  effectiveDate?: string; expiryDate?: string; totalValue?: string; totalCurrency?: string;
  counterpartyName?: string; counterpartyNameEn?: string; createdAt: string; updatedAt: string;
  parties?: Array<{ id: string; name: string; nameEn?: string; role: string; partyType: string }>;
  values?: Array<{ id: string; valueType: string; description?: string; amount: string; currency: string }>;
  signatures?: Array<{ id: string; signerName: string; signerNameEn?: string; signerTitle?: string; sequence: number; status: string; signedAt?: string }>;
}

export default function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const locale = useLocale();
  const tc = useTranslations('common');
  const { data: contract, isLoading, error, mutate } = useApi<ContractDetail>(`/contracts/${id}`);
  const [transitionTo, setTransitionTo] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState('');

  const handleTransition = async () => {
    if (!transitionTo || !contract) return;
    setTransitioning(true); setTransitionError('');
    try {
      await api.post(`/contracts/${id}/transition`, { to: transitionTo });
      await mutate(); setTransitionTo('');
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : 'Transition failed');
    } finally { setTransitioning(false); }
  };

  if (isLoading) return <p className="text-[var(--muted-foreground)]">{tc('loading')}</p>;
  if (error) return <p className="text-[var(--destructive)]">{error.message}</p>;
  if (!contract) return <p>Not found</p>;
  const allowedTransitions = TRANSITION_OPTIONS[contract.status] ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{locale === 'ar' ? contract.title : (contract.titleEn || contract.title)}</h1>
            <Badge variant={statusToVariant(contract.status)}>{contract.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{contract.contractNumber}</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>{locale === 'ar' ? 'رجوع' : 'Back'}</Button>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'الوصف' : 'Description'}</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{contract.description || (locale === 'ar' ? 'لا يوجد وصف' : 'No description')}</p></CardContent>
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
          {contract.parties && contract.parties.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'الأطراف' : 'Parties'}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {contract.parties.map((p) => (
                    <div key={p.id} className="flex items-center justify-between border-b border-[var(--border)] py-2 last:border-0">
                      <div><span className="font-medium">{locale === 'ar' ? p.name : (p.nameEn || p.name)}</span><span className="ml-2 text-sm text-[var(--muted-foreground)]">({p.partyType})</span></div>
                      <Badge variant="outline">{p.role}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {contract.values && contract.values.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'القيم' : 'Values'}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {contract.values.map((v) => (
                    <div key={v.id} className="flex items-center justify-between border-b border-[var(--border)] py-2 last:border-0">
                      <div><span className="font-medium capitalize">{v.valueType}</span>{v.description && <span className="ml-2 text-sm text-[var(--muted-foreground)]">{v.description}</span>}</div>
                      <span className="font-medium">{Number(v.amount).toLocaleString()} {v.currency}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {contract.signatures && contract.signatures.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'التوقيعات' : 'Signatures'}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {contract.signatures.map((s) => (
                    <div key={s.id} className="flex items-center justify-between border-b border-[var(--border)] py-2 last:border-0">
                      <div>
                        <span className="font-medium">{locale === 'ar' ? s.signerName : (s.signerNameEn || s.signerName)}</span>
                        {s.signerTitle && <span className="ml-2 text-sm text-[var(--muted-foreground)]">({s.signerTitle})</span>}
                        <span className="ml-2 text-xs text-[var(--muted-foreground)]">Step {s.sequence}</span>
                      </div>
                      <Badge variant={statusToVariant(s.status)}>{s.status}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'معلومات' : 'Information'}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="text-[var(--muted-foreground)]">Type: </span><span>{contract.type || '—'}</span></div>
            <div><span className="text-[var(--muted-foreground)]">Category: </span><span>{contract.category || '—'}</span></div>
            <div><span className="text-[var(--muted-foreground)]">Priority: </span><Badge variant="outline">{contract.priority}</Badge></div>
            <div><span className="text-[var(--muted-foreground)]">Classification: </span><Badge variant="outline">{contract.classification}</Badge></div>
            {contract.effectiveDate && <div><span className="text-[var(--muted-foreground)]">Effective: </span><span>{new Date(contract.effectiveDate).toLocaleDateString()}</span></div>}
            {contract.expiryDate && <div><span className="text-[var(--muted-foreground)]">Expires: </span><span>{new Date(contract.expiryDate).toLocaleDateString()}</span></div>}
            {contract.totalValue && <div><span className="text-[var(--muted-foreground)]">Total Value: </span><span className="font-medium">{Number(contract.totalValue).toLocaleString()} {contract.totalCurrency}</span></div>}
            {contract.counterpartyName && <div><span className="text-[var(--muted-foreground)]">Counterparty: </span><span>{locale === 'ar' ? contract.counterpartyName : (contract.counterpartyNameEn || contract.counterpartyName)}</span></div>}
            <div><span className="text-[var(--muted-foreground)]">Created: </span><span>{new Date(contract.createdAt).toLocaleString()}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
