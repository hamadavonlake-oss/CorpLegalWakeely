'use client';

import { use, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusToVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { useApi } from '@/lib/use-api';
import { api, ApiError } from '@/lib/api-client';
import { DocumentStatus } from '@glo/shared';

const TRANSITION_OPTIONS: Record<string, DocumentStatus[]> = {
  draft: [DocumentStatus.under_review, DocumentStatus.changes_requested, DocumentStatus.archived],
  under_review: [DocumentStatus.changes_requested, DocumentStatus.approved, DocumentStatus.draft, DocumentStatus.archived],
  changes_requested: [DocumentStatus.under_review, DocumentStatus.draft, DocumentStatus.archived],
  approved: [DocumentStatus.exported, DocumentStatus.filed, DocumentStatus.archived],
  exported: [DocumentStatus.filed, DocumentStatus.archived],
  filed: [DocumentStatus.archived],
  archived: [],
};

interface DocumentVersion {
  id: string; versionNumber: number; filename: string; mimeType: string;
  sizeBytes: number; contentHash: string; changeSummary?: string;
  uploadedBy: string; approvedBy?: string; approvedAt?: string;
  virusScanStatus: string; createdAt: string;
}

interface DocumentDetail {
  id: string; documentNumber: string; title: string; titleEn?: string; description?: string;
  type: string; status: string; classification: string;
  mimeType?: string; sizeBytes?: number; contentHash?: string;
  currentVersion: number; legalHold: boolean; retentionUntil?: string;
  uploadedBy: string; approvedBy?: string; approvedAt?: string;
  createdAt: string; updatedAt: string;
  contractId?: string; matterId?: string; legalRequestId?: string;
  contract?: { id: string; contractNumber: string; title: string };
  matter?: { id: string; matterNumber: string; title: string };
  versions?: DocumentVersion[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const locale = useLocale();
  const tc = useTranslations('common');
  const { data: document, isLoading, error, mutate } = useApi<DocumentDetail>(`/documents/${id}`);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [transitionTo, setTransitionTo] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState('');

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [changeSummary, setChangeSummary] = useState('');

  const [holdError, setHoldError] = useState('');

  const handleTransition = async () => {
    if (!transitionTo || !document) return;
    setTransitioning(true); setTransitionError('');
    try {
      await api.post(`/documents/${id}/transition`, { to: transitionTo });
      await mutate(); setTransitionTo('');
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : 'Transition failed');
    } finally { setTransitioning(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !document) return;
    setUploading(true); setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('filename', file.name);
      formData.append('mimeType', file.type || 'application/octet-stream');
      if (changeSummary) formData.append('changeSummary', changeSummary);
      await api.upload(`/documents/${id}/versions`, formData);
      await mutate();
      setChangeSummary('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally { setUploading(false); }
  };

  const handleDownload = async (versionNumber?: number) => {
    try {
      const url = versionNumber
        ? `/documents/${id}/download?version=${versionNumber}`
        : `/documents/${id}/download`;
      const result = await api.get<{ url: string; filename: string }>(url);
      // Open the signed URL in a new tab
      window.open(result.url, '_blank');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const handleToggleLegalHold = async () => {
    if (!document) return;
    setHoldError('');
    try {
      await api.post(`/documents/${id}/legal-hold`, { legalHold: !document.legalHold });
      await mutate();
    } catch (err) {
      setHoldError(err instanceof Error ? err.message : 'Failed to toggle legal hold');
    }
  };

  const handleDelete = async () => {
    if (!document) return;
    if (!confirm('Are you sure you want to delete this document? This cannot be undone.')) return;
    try {
      await api.delete(`/documents/${id}`);
      router.push('/documents');
    } catch (err) {
      setHoldError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  if (isLoading) return <p className="text-[var(--muted-foreground)]">{tc('loading')}</p>;
  if (error) return <p className="text-[var(--destructive)]">{error.message}</p>;
  if (!document) return <p>Not found</p>;

  const allowedTransitions = TRANSITION_OPTIONS[document.status] ?? [];
  const canUploadVersion = ['draft', 'under_review', 'changes_requested'].includes(document.status);
  const versions = document.versions ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{locale === 'ar' ? document.title : (document.titleEn || document.title)}</h1>
            <Badge variant={statusToVariant(document.status)}>{document.status}</Badge>
            {document.legalHold && <Badge variant="error">LEGAL HOLD</Badge>}
          </div>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{document.documentNumber}</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>{locale === 'ar' ? 'رجوع' : 'Back'}</Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'الوصف' : 'Description'}</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{document.description || (locale === 'ar' ? 'لا يوجد وصف' : 'No description')}</p></CardContent>
          </Card>

          {/* State transition */}
          {allowedTransitions.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'تغيير الحالة' : 'Change Status'}</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Select value={transitionTo} onChange={(e) => setTransitionTo(e.target.value)} className="flex-1">
                    <option value="">Select new status…</option>
                    {allowedTransitions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <Button onClick={handleTransition} disabled={!transitionTo || transitioning} loading={transitioning}>
                    {locale === 'ar' ? 'تطبيق' : 'Apply'}
                  </Button>
                </div>
                {transitionError && <p className="mt-2 text-sm text-[var(--destructive)]">{transitionError}</p>}
              </CardContent>
            </Card>
          )}

          {/* Upload new version */}
          {canUploadVersion && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{locale === 'ar' ? 'رفع نسخة جديدة' : 'Upload New Version'}</CardTitle>
              </CardHeader>
              <CardContent>
                <Field label={locale === 'ar' ? 'ملخص التغييرات' : 'Change Summary'}>
                  <Textarea
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    rows={2}
                    placeholder={locale === 'ar' ? 'ما الذي تغير في هذه النسخة؟' : 'What changed in this version?'}
                  />
                </Field>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="block w-full text-sm text-[var(--muted-foreground)] file:mr-4 file:rounded file:border-0 file:bg-[var(--primary)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--primary-foreground)] hover:file:opacity-90"
                />
                {uploading && <p className="mt-2 text-sm text-[var(--muted-foreground)]">Uploading…</p>}
                {uploadError && <p className="mt-2 text-sm text-[var(--destructive)]">{uploadError}</p>}
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  {locale === 'ar' ? 'سيتم إنشاء نسخة جديدة برقم متسلسل. النسخ الموافق عليها لا يمكن تعديلها.' : 'A new version will be created. Approved documents cannot be modified.'}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Version history */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {locale === 'ar' ? 'سجل النسخ' : 'Version History'}
                <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">({versions.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">{locale === 'ar' ? 'لا توجد نسخ' : 'No versions yet'}</p>
              ) : (
                <div className="space-y-3">
                  {versions.map((v) => (
                    <div key={v.id} className="border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">v{v.versionNumber}</span>
                            {v.versionNumber === document.currentVersion && (
                              <Badge variant="info">Latest</Badge>
                            )}
                            {v.approvedAt && <Badge variant="success">Approved</Badge>}
                            <Badge variant="outline">{v.virusScanStatus}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{v.filename}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {formatBytes(v.sizeBytes)} · {new Date(v.createdAt).toLocaleString()}
                          </p>
                          {v.changeSummary && (
                            <p className="mt-1 text-sm italic text-[var(--muted-foreground)]">
                              &ldquo;{v.changeSummary}&rdquo;
                            </p>
                          )}
                          <p className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">
                            SHA-256: {v.contentHash.slice(0, 16)}…
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleDownload(v.versionNumber)}>
                          {locale === 'ar' ? 'تحميل' : 'Download'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'معلومات' : 'Information'}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-[var(--muted-foreground)]">Type: </span><span>{document.type}</span></div>
              <div><span className="text-[var(--muted-foreground)]">Classification: </span><Badge variant="outline">{document.classification}</Badge></div>
              <div><span className="text-[var(--muted-foreground)]">Current Version: </span><span className="font-medium">v{document.currentVersion}</span></div>
              {document.mimeType && <div><span className="text-[var(--muted-foreground)]">MIME: </span><span className="text-xs">{document.mimeType}</span></div>}
              {document.sizeBytes && <div><span className="text-[var(--muted-foreground)]">Size: </span>{formatBytes(document.sizeBytes)}</div>}
              {document.contentHash && (
                <div><span className="text-[var(--muted-foreground)]">Hash: </span><span className="font-mono text-xs">{document.contentHash.slice(0, 16)}…</span></div>
              )}
              {document.contract && (
                <div>
                  <span className="text-[var(--muted-foreground)]">Contract: </span>
                  <a href={`/contracts/${document.contract.id}`} className="text-[var(--primary)] hover:underline">
                    {document.contract.contractNumber}
                  </a>
                </div>
              )}
              {document.matter && (
                <div>
                  <span className="text-[var(--muted-foreground)]">Matter: </span>
                  <a href={`/matters/${document.matter.id}`} className="text-[var(--primary)] hover:underline">
                    {document.matter.matterNumber}
                  </a>
                </div>
              )}
              <div><span className="text-[var(--muted-foreground)]">Created: </span>{new Date(document.createdAt).toLocaleString()}</div>
              {document.approvedAt && <div><span className="text-[var(--muted-foreground)]">Approved: </span>{new Date(document.approvedAt).toLocaleString()}</div>}
            </CardContent>
          </Card>

          {/* Legal Hold + Retention */}
          <Card>
            <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'الضبط القانوني' : 'Legal Hold'}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {document.legalHold
                    ? (locale === 'ar' ? 'مفعّل — لا يمكن الحذف' : 'Active — deletion blocked')
                    : (locale === 'ar' ? 'غير مفعّل' : 'Not active')}
                </span>
                <Badge variant={document.legalHold ? 'error' : 'outline'}>
                  {document.legalHold ? 'ON' : 'OFF'}
                </Badge>
              </div>
              <Button
                variant={document.legalHold ? 'outline' : 'destructive'}
                size="sm"
                onClick={handleToggleLegalHold}
                className="w-full"
              >
                {document.legalHold
                  ? (locale === 'ar' ? 'إلغاء الضبط' : 'Remove Hold')
                  : (locale === 'ar' ? 'تفعيل الضبط' : 'Place Hold')}
              </Button>
              {holdError && <p className="text-sm text-[var(--destructive)]">{holdError}</p>}
              <p className="text-xs text-[var(--muted-foreground)]">
                {locale === 'ar'
                  ? 'الضبط القانوني يمنع حذف المستند نهائياً.'
                  : 'Legal Hold prevents permanent deletion of this document.'}
              </p>
            </CardContent>
          </Card>

          {/* Download + Delete */}
          <Card>
            <CardContent className="space-y-2 p-4">
              <Button variant="outline" className="w-full" onClick={() => handleDownload()}>
                {locale === 'ar' ? 'تحميل النسخة الحالية' : 'Download Latest'}
              </Button>
              {!document.legalHold && document.status === 'draft' && (
                <Button variant="destructive" size="sm" className="w-full" onClick={handleDelete}>
                  {locale === 'ar' ? 'حذف المستند' : 'Delete Document'}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
