'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/lib/use-api';

interface Role {
  id: string; code: string; name: string; nameEn?: string;
  description?: string; isSystem: boolean;
  permissions?: Array<{ permission: { code: string; name: string; module: string } }>;
}

export default function RolesPage() {
  const t = useTranslations('common');
  const locale = useLocale();
  const { data: roles, isLoading, error } = useApi<Role[]>('/organizations/me/roles');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{locale === 'ar' ? 'الأدوار والصلاحيات' : 'Roles & Permissions'}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {locale === 'ar' ? 'عرض الأدوار والصلاحيات المعرفة في النظام' : 'View the roles and permissions configured in the system'}
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t('loading')}</p>
      ) : error ? (
        <p className="text-sm text-[var(--destructive)]">{error.message}</p>
      ) : !roles || roles.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t('noResults')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {roles.map((role) => {
            const permissionsByModule = (role.permissions ?? []).reduce<Record<string, string[]>>((acc, p) => {
              const mod = p.permission.module;
              if (!acc[mod]) acc[mod] = [];
              acc[mod].push(p.permission.code);
              return acc;
            }, {});

            return (
              <Card key={role.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {locale === 'ar' ? role.name : (role.nameEn || role.name)}
                    </CardTitle>
                    {role.isSystem ? (
                      <Badge variant="info">System</Badge>
                    ) : (
                      <Badge variant="outline">Custom</Badge>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] font-mono">{role.code}</p>
                </CardHeader>
                <CardContent>
                  {role.description && (
                    <p className="mb-3 text-sm text-[var(--muted-foreground)]">{role.description}</p>
                  )}
                  <div className="space-y-2">
                    {Object.entries(permissionsByModule).map(([module, perms]) => (
                      <div key={module}>
                        <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">{module}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {perms.map((p) => (
                            <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                    {Object.keys(permissionsByModule).length === 0 && (
                      <p className="text-sm text-[var(--muted-foreground)]">No permissions assigned</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
