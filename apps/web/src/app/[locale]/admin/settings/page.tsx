'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { useApi } from '@/lib/use-api';
import { api, ApiError } from '@/lib/api-client';

interface OrgSettings {
  id: string;
  name: string;
  nameEn?: string;
  slug: string;
  countryPack?: string;
  settingsRel?: {
    defaultLocale: string;
    defaultTimezone: string;
    defaultCurrency: string;
    mfaMandatory: boolean;
    retentionDays?: number;
  };
}

export default function SettingsPage() {
  const locale = useLocale();
  const { data: org, isLoading, error, mutate } = useApi<OrgSettings>('/organizations/me');

  const [defaultLocale, setDefaultLocale] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('');
  const [defaultTimezone, setDefaultTimezone] = useState('');
  const [mfaMandatory, setMfaMandatory] = useState(false);
  const [retentionDays, setRetentionDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialize form when data loads
  if (org && !initialized) {
    setDefaultLocale(org.settingsRel?.defaultLocale ?? 'ar');
    setDefaultCurrency(org.settingsRel?.defaultCurrency ?? 'JOD');
    setDefaultTimezone(org.settingsRel?.defaultTimezone ?? 'Asia/Amman');
    setMfaMandatory(org.settingsRel?.mfaMandatory ?? false);
    setRetentionDays(org.settingsRel?.retentionDays?.toString() ?? '');
    setInitialized(true);
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setSaveError(''); setSaveSuccess(false);
    try {
      await api.patch('/organizations/me/settings', {
        defaultLocale,
        defaultCurrency,
        defaultTimezone,
        mfaMandatory,
        retentionDays: retentionDays ? parseInt(retentionDays, 10) : undefined,
      });
      await mutate();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save settings');
    } finally { setSaving(false); }
  };

  if (isLoading) return <p className="text-[var(--muted-foreground)]">Loading…</p>;
  if (error) return <p className="text-[var(--destructive)]">{error.message}</p>;
  if (!org) return <p>Not found</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{locale === 'ar' ? 'إعدادات المؤسسة' : 'Organization Settings'}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {locale === 'ar' ? 'إدارة الإعدادات الافتراضية وسياسات الأمان' : 'Manage default settings and security policies'}
        </p>
      </div>

      {/* Organization info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{locale === 'ar' ? 'معلومات المؤسسة' : 'Organization Info'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--muted-foreground)]">{locale === 'ar' ? 'الاسم' : 'Name'}: </span>
            <span className="font-medium">{locale === 'ar' ? org.name : (org.nameEn || org.name)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted-foreground)]">Slug: </span>
            <span className="font-mono text-xs">{org.slug}</span>
          </div>
          {org.countryPack && (
            <div className="flex justify-between">
              <span className="text-[var(--muted-foreground)]">{locale === 'ar' ? 'حزمة البلد' : 'Country Pack'}: </span>
              <span>{org.countryPack}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{locale === 'ar' ? 'الإعدادات الافتراضية' : 'Default Settings'}</CardTitle>
          <CardDescription>
            {locale === 'ar' ? 'تُستخدم هذه القيم كافتراضية للمستخدمين والمستندات الجديدة' : 'These values are used as defaults for new users and documents'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label={locale === 'ar' ? 'اللغة الافتراضية' : 'Default Locale'}>
                <Select value={defaultLocale} onChange={(e) => setDefaultLocale(e.target.value)}>
                  <option value="ar">العربية (ar)</option>
                  <option value="en">English (en)</option>
                </Select>
              </Field>
              <Field label={locale === 'ar' ? 'العملة الافتراضية' : 'Default Currency'}>
                <Select value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)}>
                  <option value="JOD">JOD — Jordanian Dinar</option>
                  <option value="SAR">SAR — Saudi Riyal</option>
                  <option value="AED">AED — UAE Dirham</option>
                  <option value="EGP">EGP — Egyptian Pound</option>
                  <option value="USD">USD — US Dollar</option>
                </Select>
              </Field>
            </div>
            <Field label={locale === 'ar' ? 'المنطقة الزمنية' : 'Timezone'}>
              <Select value={defaultTimezone} onChange={(e) => setDefaultTimezone(e.target.value)}>
                <option value="Asia/Amman">Asia/Amman (UTC+3)</option>
                <option value="Asia/Riyadh">Asia/Riyadh (UTC+3)</option>
                <option value="Asia/Dubai">Asia/Dubai (UTC+4)</option>
                <option value="Africa/Cairo">Africa/Cairo (UTC+2)</option>
                <option value="UTC">UTC</option>
              </Select>
            </Field>
            <Field label={locale === 'ar' ? 'أيام الاحتفاظ' : 'Retention Days'}>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                placeholder={locale === 'ar' ? '3650 (10 سنوات)' : '3650 (10 years)'}
                min={1}
              />
            </Field>

            {/* MFA toggle */}
            <div className="flex items-center justify-between rounded border border-[var(--border)] p-4">
              <div>
                <p className="font-medium">{locale === 'ar' ? 'التحقق الثنائي إلزامي' : 'MFA Mandatory'}</p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {locale === 'ar' ? 'يتطلب من جميع المستخدمين تفعيل التحقق الثنائي' : 'Require all users to enable multi-factor authentication'}
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={mfaMandatory}
                  onChange={(e) => setMfaMandatory(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-[var(--muted)] peer-checked:bg-[var(--success)] peer-focus:ring-2 peer-focus:ring-[var(--primary)] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-5" />
              </label>
            </div>

            {saveError && <p className="text-sm text-[var(--destructive)]">{saveError}</p>}
            {saveSuccess && (
              <p className="text-sm text-[var(--success)]">
                {locale === 'ar' ? 'تم حفظ الإعدادات بنجاح' : 'Settings saved successfully'}
              </p>
            )}
            <Button type="submit" loading={saving}>
              {locale === 'ar' ? 'حفظ الإعدادات' : 'Save Settings'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
