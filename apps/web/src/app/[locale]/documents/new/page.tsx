'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api-client';

export default function NewDocumentPage() {
  const router = useRouter();
  const locale = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('contract_draft');
  const [classification, setClassification] = useState('internal');
  const [contractId, setContractId] = useState('');
  const [matterId, setMatterId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [changeSummary, setChangeSummary] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError(locale === 'ar' ? 'الرجاء اختيار ملف' : 'Please select a file');
      return;
    }
    setError(''); setLoading(true);
    try {
      // Step 1: Create the document metadata
      const doc = await api.post<{ id: string; documentNumber: string }>('/documents', {
        title,
        titleEn: titleEn || undefined,
        description,
        type,
        classification,
        contractId: contractId || undefined,
        matterId: matterId || undefined,
      });

      // Step 2: Upload the first version
      const formData = new FormData();
      formData.append('file', file);
      formData.append('filename', file.name);
      formData.append('mimeType', file.type || 'application/octet-stream');
      if (changeSummary) formData.append('changeSummary', changeSummary);
      await api.upload(`/documents/${doc.id}/versions`, formData);

      router.push(`/documents/${doc.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create document');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">{locale === 'ar' ? 'مستند جديد' : 'New Document'}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{locale === 'ar' ? 'تفاصيل المستند' : 'Document Details'}</CardTitle>
          <CardDescription>
            {locale === 'ar'
              ? 'سيتم إنشاء المستند كمسودة ورفع النسخة الأولى'
              : 'The document will be created as a draft with the first version uploaded'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Field label={locale === 'ar' ? 'العنوان (عربي)' : 'Title (Arabic)'}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder={locale === 'ar' ? 'عنوان المستند' : 'Document title'} />
            </Field>
            <Field label={locale === 'ar' ? 'العنوان (إنجليزي)' : 'Title (English)'}>
              <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder="Document title (English)" />
            </Field>
            <Field label={locale === 'ar' ? 'الوصف' : 'Description'}>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={locale === 'ar' ? 'وصف مختصر' : 'Brief description'} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={locale === 'ar' ? 'النوع' : 'Type'}>
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="contract_draft">Contract Draft</option>
                  <option value="signed_contract">Signed Contract</option>
                  <option value="exhibit">Exhibit</option>
                  <option value="evidence">Evidence</option>
                  <option value="correspondence">Correspondence</option>
                  <option value="memo">Memo</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label={locale === 'ar' ? 'التصنيف' : 'Classification'}>
                <Select value={classification} onChange={(e) => setClassification(e.target.value)}>
                  <option value="public">Public</option>
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                  <option value="restricted">Restricted</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label={locale === 'ar' ? 'معرف العقد (اختياري)' : 'Contract ID (optional)'}>
                <Input value={contractId} onChange={(e) => setContractId(e.target.value)} placeholder="ctr-…" />
              </Field>
              <Field label={locale === 'ar' ? 'معرف القضية (اختياري)' : 'Matter ID (optional)'}>
                <Input value={matterId} onChange={(e) => setMatterId(e.target.value)} placeholder="mtr-…" />
              </Field>
            </div>

            <Field label={locale === 'ar' ? 'الملف' : 'File'}>
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-[var(--muted-foreground)] file:mr-4 file:rounded file:border-0 file:bg-[var(--primary)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--primary-foreground)] hover:file:opacity-90"
              />
              {file && (
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </Field>

            <Field label={locale === 'ar' ? 'ملخص التغييرات' : 'Change Summary'}>
              <Textarea
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                rows={2}
                placeholder={locale === 'ar' ? 'النسخة الأولية' : 'Initial version'}
              />
            </Field>

            {error && <p className="mb-4 text-sm text-[var(--destructive)]">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" loading={loading}>
                {locale === 'ar' ? 'إنشاء + رفع' : 'Create + Upload'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                {locale === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
