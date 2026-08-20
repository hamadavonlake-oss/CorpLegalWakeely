'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApi } from '@/lib/use-api';
import { api, ApiError } from '@/lib/api-client';

interface CountryPack {
  packId: string;
  countryCode: string;
  countryName: string;
  version: string;
  compatibility: string;
  locale: string;
  currency: string;
  timezone: string;
  isActive?: boolean;
}

export default function CountryPacksPage() {
  const t = useTranslations('common');
  const locale = useLocale();
  const { data: packs, isLoading, error, mutate } = useApi<CountryPack[]>('/country-packs');
  const { data: org } = useApi<{ countryPack?: string }>('/organizations/me');

  const [activating, setActivating] = useState<string | null>(null);
  const [activateError, setActivateError] = useState('');

  const handleActivate = async (countryCode: string) => {
    if (!confirm(`Activate the ${countryCode} country pack? This will update your organization's default locale, currency, and timezone.`)) return;
    setActivating(countryCode); setActivateError('');
    try {
      await api.post(`/country-packs/${countryCode}/activate`, {});
      await mutate();
    } catch (err) {
      setActivateError(err instanceof ApiError ? err.message : 'Failed to activate country pack');
    } finally { setActivating(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{locale === 'ar' ? 'حزم الدول' : 'Country Packs'}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {locale === 'ar' ? 'حزم مترجمة للدول تتضمن اللغة والعملة والمنطقة الزمنية' : 'Country-specific locale, currency, and timezone packs'}
        </p>
      </div>

      {org?.countryPack && (
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Badge variant="success">Active</Badge>
            <span className="text-sm">
              {locale === 'ar' ? 'الحزمة الحالية: ' : 'Current pack: '}
              <span className="font-medium font-mono">{org.countryPack}</span>
            </span>
          </CardContent>
        </Card>
      )}

      {activateError && <p className="text-sm text-[var(--destructive)]">{activateError}</p>}

      {isLoading ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t('loading')}</p>
      ) : error ? (
        <p className="text-sm text-[var(--destructive)]">{error.message}</p>
      ) : !packs || packs.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-[var(--muted-foreground)]">
              {locale === 'ar' ? 'لا توجد حزم دول متاحة. ضع حزم في مجلد packages/country-packs/' : 'No country packs available. Place packs in packages/country-packs/ directory.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {packs.map((pack) => {
            const isActive = org?.countryPack === pack.countryCode;
            return (
              <Card key={pack.packId}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{pack.countryName}</CardTitle>
                    {isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="outline">Available</Badge>
                    )}
                  </div>
                  <CardDescription className="font-mono text-xs">{pack.packId}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted-foreground)]">Country:</span>
                    <span>{pack.countryCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted-foreground)]">Locale:</span>
                    <span>{pack.locale}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted-foreground)]">Currency:</span>
                    <span>{pack.currency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted-foreground)]">Timezone:</span>
                    <span className="text-xs">{pack.timezone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted-foreground)]">Version:</span>
                    <span className="text-xs">{pack.version}</span>
                  </div>
                  {!isActive && (
                    <Button
                      className="mt-2 w-full"
                      size="sm"
                      loading={activating === pack.countryCode}
                      onClick={() => handleActivate(pack.countryCode)}
                    >
                      {locale === 'ar' ? 'تفعيل' : 'Activate'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
