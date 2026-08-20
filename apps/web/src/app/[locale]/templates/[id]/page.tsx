'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { useApi } from '@/lib/use-api';
import { api, ApiError } from '@/lib/api-client';

interface Template {
  id: string; templateCode: string; name: string; nameEn?: string;
  description?: string; type: string; locale: string; version: number;
  isActive: boolean; filename: string;
  variablesSchema?: Record<string, unknown>;
  defaultValues?: Record<string, unknown>;
  clauses?: Array<{
    placeholderName: string;
    clause: { id: string; code: string; title: string; bodyText: string };
  }>;
}

interface FillResult {
  document: { id: string; documentNumber: string };
  downloadUrl: string;
  filename: string;
  sizeBytes: number;
}

export default function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const locale = useLocale();
  const tc = useTranslations('common');
  const { data: template, isLoading, error } = useApi<Template>(`/templates/${id}`);

  const [variables, setVariables] = useState<Record<string, string>>({});
  const [outputFilename, setOutputFilename] = useState('');
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState('');
  const [fillResult, setFillResult] = useState<FillResult | null>(null);

  const handleFill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template) return;
    setFilling(true); setFillError(''); setFillResult(null);
    try {
      const result = await api.post<FillResult>(`/templates/${id}/fill`, {
        variables,
        outputFilename: outputFilename || undefined,
      });
      setFillResult(result);
    } catch (err) {
      setFillError(err instanceof ApiError ? err.message : 'Failed to fill template');
    } finally { setFilling(false); }
  };

  if (isLoading) return <p className="text-[var(--muted-foreground)]">{tc('loading')}</p>;
  if (error) return <p className="text-[var(--destructive)]">{error.message}</p>;
  if (!template) return <p>Not found</p>;

  // Parse variables from the schema (simplified — shows all string keys)
  const schemaVars = template.variablesSchema
    ? Object.keys(template.variablesSchema as Record<string, unknown>)
    : [];

  const clausePlaceholders = template.clauses?.map((c) => c.placeholderName) ?? [];
  const allPlaceholders = [...new Set([...schemaVars, ...clausePlaceholders])];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">
              {locale === 'ar' ? template.name : (template.nameEn || template.name)}
            </h1>
            {template.isActive ? (
              <Badge variant="success">Active</Badge>
            ) : (
              <Badge variant="outline">Inactive</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{template.templateCode}</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          {locale === 'ar' ? 'رجوع' : 'Back'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'الوصف' : 'Description'}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">
                {template.description || (locale === 'ar' ? 'لا يوجد وصف' : 'No description')}
              </p>
            </CardContent>
          </Card>

          {/* Fill template form */}
          {template.isActive ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{locale === 'ar' ? 'ملء القالب' : 'Fill Template'}</CardTitle>
                <CardDescription>
                  {locale === 'ar'
                    ? 'أدخل قيم المتغيرات لإنشاء مستند جديد من القالب'
                    : 'Enter variable values to generate a new document from this template'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {fillResult ? (
                  <div className="space-y-4">
                    <div className="rounded border border-[var(--success)] bg-[var(--success)]/10 p-4">
                      <p className="font-medium text-[var(--success)]">
                        {locale === 'ar' ? 'تم إنشاء المستند بنجاح!' : 'Document generated successfully!'}
                      </p>
                      <p className="mt-1 text-sm">
                        {locale === 'ar' ? 'رقم المستند: ' : 'Document: '}
                        <span className="font-mono">{fillResult.document.documentNumber}</span>
                      </p>
                      <p className="text-sm">
                        {locale === 'ar' ? 'الحجم: ' : 'Size: '}
                        {(fillResult.sizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => window.open(fillResult.downloadUrl, '_blank')}>
                        {locale === 'ar' ? 'تحميل الملف' : 'Download File'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => router.push(`/documents/${fillResult.document.id}`)}
                      >
                        {locale === 'ar' ? 'عرض المستند' : 'View Document'}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => { setFillResult(null); setVariables({}); setOutputFilename(''); }}
                      >
                        {locale === 'ar' ? 'ملء مرة أخرى' : 'Fill Again'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleFill}>
                    {allPlaceholders.length === 0 ? (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        {locale === 'ar'
                          ? 'لا توجد متغيرات — اضغط ملء لإنشاء مستند بالقيم الافتراضية'
                          : 'No variables — click Fill to generate a document with default values'}
                      </p>
                    ) : (
                      <>
                        {schemaVars.map((varName) => (
                          <Field key={varName} label={varName}>
                            <Input
                              value={variables[varName] ?? ''}
                              onChange={(e) => setVariables({ ...variables, [varName]: e.target.value })}
                              placeholder={`Enter ${varName}…`}
                            />
                          </Field>
                        ))}
                        {clausePlaceholders.length > 0 && (
                          <div className="mb-4 rounded border border-[var(--border)] p-3">
                            <p className="mb-2 text-sm font-medium">
                              {locale === 'ar' ? 'البنود المرتبطة (تُملأ تلقائياً):' : 'Linked Clauses (auto-filled):'}
                            </p>
                            <ul className="text-sm text-[var(--muted-foreground)]">
                              {template.clauses?.map((c) => (
                                <li key={c.clause.id}>
                                  <code className="text-xs">{`{${c.placeholderName}}`}</code> → {c.clause.title}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}

                    <Field label={locale === 'ar' ? 'اسم الملف الناتج (اختياري)' : 'Output Filename (optional)'}>
                      <Input
                        value={outputFilename}
                        onChange={(e) => setOutputFilename(e.target.value)}
                        placeholder={locale === 'ar' ? 'اسم_المستند' : 'document_name'}
                      />
                    </Field>

                    {fillError && <p className="mb-4 text-sm text-[var(--destructive)]">{fillError}</p>}
                    <Button type="submit" loading={filling} disabled={!template.isActive}>
                      {locale === 'ar' ? 'إنشاء المستند' : 'Generate Document'}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-[var(--muted-foreground)]">
                  {locale === 'ar' ? 'هذا القالب غير نشط ولا يمكن ملؤه.' : 'This template is inactive and cannot be filled.'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <Card>
          <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'معلومات' : 'Information'}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="text-[var(--muted-foreground)]">Type: </span><Badge variant="outline">{template.type}</Badge></div>
            <div><span className="text-[var(--muted-foreground)]">Locale: </span><span>{template.locale}</span></div>
            <div><span className="text-[var(--muted-foreground)]">Version: </span><span>v{template.version}</span></div>
            <div><span className="text-[var(--muted-foreground)]">Filename: </span><span className="text-xs">{template.filename}</span></div>
            <div><span className="text-[var(--muted-foreground)]">Variables: </span><span>{schemaVars.length}</span></div>
            <div><span className="text-[var(--muted-foreground)]">Clauses: </span><span>{clausePlaceholders.length}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
