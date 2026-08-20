'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/lib/use-api';

interface PaginatedResponse<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean }; }
interface Template {
  id: string; templateCode: string; name: string; nameEn?: string;
  description?: string; type: string; locale: string; version: number;
  isActive: boolean; filename: string; createdAt: string;
}

export default function TemplatesPage() {
  const t = useTranslations('common');
  const locale = useLocale();
  const { data, isLoading, error } = useApi<PaginatedResponse<Template>>('/templates?page=1&limit=50');
  const templates = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{locale === 'ar' ? 'القوالب' : 'Templates'}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {locale === 'ar' ? 'جميع القوالب' : 'All Templates'}
            <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">({data?.meta.total ?? 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t('loading')}</p>
          ) : error ? (
            <p className="text-sm text-[var(--destructive)]">{error.message}</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t('noResults')}</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((tmpl) => (
                <Link key={tmpl.id} href={`/templates/${tmpl.id}`}>
                  <Card className="cursor-pointer hover:border-[var(--primary)] transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {locale === 'ar' ? tmpl.name : (tmpl.nameEn || tmpl.name)}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">{tmpl.templateCode}</p>
                        </div>
                        {tmpl.isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </div>
                      {tmpl.description && (
                        <p className="mt-2 text-sm text-[var(--muted-foreground)] line-clamp-2">
                          {tmpl.description}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                        <Badge variant="outline">{tmpl.type}</Badge>
                        <span>·</span>
                        <span>v{tmpl.version}</span>
                        <span>·</span>
                        <span>{tmpl.locale}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
