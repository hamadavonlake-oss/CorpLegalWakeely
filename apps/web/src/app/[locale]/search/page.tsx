'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, statusToVariant } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useApi } from '@/lib/use-api';

interface SearchResult {
  id: string;
  type: 'legal_request' | 'matter' | 'contract' | 'document';
  number: string;
  title: string;
  titleEn?: string;
  status: string;
  description?: string;
  createdAt: string;
  score?: number;
}

interface SearchResponse {
  query: string;
  type?: string;
  results: SearchResult[];
  total: number;
}

export default function SearchPage() {
  const t = useTranslations('common');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('');
  const [submitted, setSubmitted] = useState('');

  const queryParams = new URLSearchParams({ q: query });
  if (searchType) queryParams.set('type', searchType);

  // Only search when query is submitted (not on every keystroke)
  const { data, isLoading, error } = useApi<SearchResponse>(
    submitted ? `/search?${queryParams.toString()}` : null,
  ) as { data: SearchResponse | undefined; isLoading: boolean; error: { message: string } | null };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(query);
  };

  const typeIcon: Record<string, string> = {
    legal_request: '📋',
    matter: '⚖️',
    contract: '📝',
    document: '📄',
  };

  const results = data?.results ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{locale === 'ar' ? 'البحث' : 'Search'}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {locale === 'ar' ? 'ابحث في الطلبات والقضايا والعقود والمستندات' : 'Search across requests, matters, contracts, and documents'}
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={locale === 'ar' ? 'ابحث بالعنوان أو الوصف أو الرقم…' : 'Search by title, description, or number…'}
          className="flex-1"
          autoFocus
        />
        <Select value={searchType} onChange={(e) => setSearchType(e.target.value)} className="w-48">
          <option value="">All Types</option>
          <option value="legal_request">Legal Requests</option>
          <option value="matter">Matters</option>
          <option value="contract">Contracts</option>
          <option value="document">Documents</option>
        </Select>
        <Button type="submit" loading={isLoading}>{locale === 'ar' ? 'بحث' : 'Search'}</Button>
      </form>

      {/* Results */}
      {submitted && (
        <Card>
          <CardContent className="p-4">
            {isLoading ? (
              <p className="text-sm text-[var(--muted-foreground)]">{t('loading')}</p>
            ) : error ? (
              <p className="text-sm text-[var(--destructive)]">{error.message}</p>
            ) : results.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-[var(--muted-foreground)]">{t('noResults')}</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {locale === 'ar' ? `لا توجد نتائج لـ: "${submitted}"` : `No results for: "${submitted}"`}
                </p>
              </div>
            ) : (
              <>
                <p className="mb-3 text-sm text-[var(--muted-foreground)]">
                  {data?.total ?? 0} {locale === 'ar' ? 'نتيجة لـ' : 'results for'} &ldquo;{submitted}&rdquo;
                </p>
                <div className="space-y-2">
                  {results.map((r) => {
                    const href = `/${r.type === 'legal_request' ? 'requests' : r.type === 'matter' ? 'matters' : r.type === 'contract' ? 'contracts' : 'documents'}/${r.id}`;
                    return (
                      <Link
                        key={`${r.type}-${r.id}`}
                        href={href}
                        className="block rounded p-3 hover:bg-[var(--muted)] transition-colors border border-[var(--border)]"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span>{typeIcon[r.type]}</span>
                              <span className="font-medium">
                                {locale === 'ar' ? r.title : (r.titleEn || r.title)}
                              </span>
                              <Badge variant={statusToVariant(r.status)}>{r.status}</Badge>
                            </div>
                            {r.description && (
                              <p className="mt-1 text-sm text-[var(--muted-foreground)] line-clamp-2">
                                {r.description}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-[var(--muted-foreground)] font-mono">
                              {r.number} · {r.type} · {new Date(r.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state (no search yet) */}
      {!submitted && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-sm text-[var(--muted-foreground)]">
              {locale === 'ar' ? 'ابدأ بالكتابة للبحث في النظام' : 'Start typing to search across the system'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
