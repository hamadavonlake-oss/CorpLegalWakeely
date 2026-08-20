'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';

export default function NewRequestPage() {
  const router = useRouter();
  const locale = useLocale();
  const [title, setTitle] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('contract_review');
  const [priority, setPriority] = useState('medium');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const result = await api.post<{ id: string; requestNumber: string }>('/legal-requests', {
        title, titleEn: titleEn || undefined, description, type, priority,
      });
      router.push(`/requests/${result.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create request');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">{locale === 'ar' ? 'طلب قانوني جديد' : 'New Legal Request'}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{locale === 'ar' ? 'تفاصيل الطلب' : 'Request Details'}</CardTitle>
          <CardDescription>{locale === 'ar' ? 'سيتم إنشاء الطلب كمسودة ويمكنك تعديله قبل الإرسال' : 'The request will be created as a draft — you can edit it before submitting'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Field label={locale === 'ar' ? 'العنوان (عربي)' : 'Title (Arabic)'}><Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder={locale === 'ar' ? 'عنوان الطلب' : 'Request title'} /></Field>
            <Field label={locale === 'ar' ? 'العنوان (إنجليزي)' : 'Title (English)'}><Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder="Request title (English)" /></Field>
            <Field label={locale === 'ar' ? 'الوصف' : 'Description'}><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder={locale === 'ar' ? 'اشرح طلبك بالتفصيل…' : 'Describe your request…'} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={locale === 'ar' ? 'النوع' : 'Type'}>
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="contract_review">Contract Review</option>
                  <option value="compliance_inquiry">Compliance Inquiry</option>
                  <option value="dispute">Dispute</option>
                  <option value="legal_advice">Legal Advice</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label={locale === 'ar' ? 'الأولوية' : 'Priority'}>
                <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </Select>
              </Field>
            </div>
            {error && <p className="mb-4 text-sm text-[var(--destructive)]">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" loading={loading}>{locale === 'ar' ? 'إنشاء الطلب' : 'Create Request'}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
