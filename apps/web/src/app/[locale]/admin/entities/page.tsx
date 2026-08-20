'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { useApi } from '@/lib/use-api';
import { api, ApiError } from '@/lib/api-client';

interface PaginatedResponse<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean }; }
interface Entity {
  id: string; name: string; nameEn?: string; legalName?: string;
  registrationNo?: string; countryCode: string; entityType?: string;
  isActive: boolean; createdAt: string;
  departments?: Array<{ id: string; name: string; nameEn?: string }>;
}

export default function EntitiesPage() {
  const t = useTranslations('common');
  const locale = useLocale();
  const { data, isLoading, error, mutate } = useApi<PaginatedResponse<Entity>>('/organizations/me/entities?page=1&limit=50');
  const entities = data?.data ?? [];

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [legalName, setLegalName] = useState('');
  const [registrationNo, setRegistrationNo] = useState('');
  const [countryCode, setCountryCode] = useState('JO');
  const [entityType, setEntityType] = useState('limited_liability_company');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setCreateError(''); setCreating(true);
    try {
      await api.post('/organizations/me/entities', {
        name, nameEn: nameEn || undefined, legalName: legalName || undefined,
        registrationNo: registrationNo || undefined, countryCode, entityType,
      });
      setShowForm(false);
      setName(''); setNameEn(''); setLegalName(''); setRegistrationNo('');
      await mutate();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create entity');
    } finally { setCreating(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{locale === 'ar' ? 'الكيانات والأقسام' : 'Entities & Departments'}</h1>
        <Button onClick={() => setShowForm(!showForm)}>{locale === 'ar' ? 'كيان جديد' : 'New Entity'}</Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'إنشاء كيان جديد' : 'Create New Entity'}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label={locale === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
                <Field label={locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'}><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></Field>
              </div>
              <Field label={locale === 'ar' ? 'الاسم القانوني' : 'Legal Name'}><Input value={legalName} onChange={(e) => setLegalName(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={locale === 'ar' ? 'رقم التسجيل' : 'Registration No.'}><Input value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} /></Field>
                <Field label={locale === 'ar' ? 'البلد' : 'Country'}>
                  <Select value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                    <option value="JO">Jordan</option>
                    <option value="SA">Saudi Arabia</option>
                    <option value="AE">UAE</option>
                    <option value="EG">Egypt</option>
                  </Select>
                </Field>
              </div>
              <Field label={locale === 'ar' ? 'النوع' : 'Entity Type'}>
                <Select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
                  <option value="limited_liability_company">Limited Liability Company</option>
                  <option value="joint_stock_company">Joint Stock Company</option>
                  <option value="branch">Branch</option>
                  <option value="representative_office">Representative Office</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              {createError && <p className="text-sm text-[var(--destructive)]">{createError}</p>}
              <div className="flex gap-2">
                <Button type="submit" loading={creating}>{locale === 'ar' ? 'إنشاء' : 'Create'}</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{locale === 'ar' ? 'الكيانات' : 'Entities'} ({entities.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-[var(--muted-foreground)]">{t('loading')}</p>
           : error ? <p className="text-sm text-[var(--destructive)]">{error.message}</p>
           : entities.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">{t('noResults')}</p>
           : (
            <div className="space-y-4">
              {entities.map((ent) => (
                <div key={ent.id} className="border-b border-[var(--border)] pb-4 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{locale === 'ar' ? ent.name : (ent.nameEn || ent.name)}</p>
                      {ent.legalName && <p className="text-sm text-[var(--muted-foreground)]">{ent.legalName}</p>}
                      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                        {ent.registrationNo && <span>Reg: {ent.registrationNo}</span>}
                        <span>·</span>
                        <Badge variant="outline">{ent.countryCode}</Badge>
                        {ent.entityType && <Badge variant="outline">{ent.entityType}</Badge>}
                        {ent.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="error">Inactive</Badge>}
                      </div>
                    </div>
                  </div>
                  {ent.departments && ent.departments.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Departments</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {ent.departments.map((d) => (
                          <Badge key={d.id} variant="outline" className="text-xs">
                            {locale === 'ar' ? d.name : (d.nameEn || d.name)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
