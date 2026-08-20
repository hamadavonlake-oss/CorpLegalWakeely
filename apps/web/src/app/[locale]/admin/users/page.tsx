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
interface User {
  id: string; email: string; firstName: string; firstNameEn?: string;
  lastName: string; lastNameEn?: string; displayName: string;
  status: string; mfaEnabled: boolean; isActive: boolean;
  createdAt: string; lastLoginAt?: string;
  roles?: Array<{ role: { code: string; name: string } }>;
}

export default function UsersPage() {
  const t = useTranslations('common');
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, isLoading, error, mutate } = useApi<PaginatedResponse<User>>(
    `/organizations/me/users?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`,
  );
  const users = data?.data ?? [];

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteRole, setInviteRole] = useState('lawyer');
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(''); setInviteLoading(true);
    try {
      await api.post('/organizations/me/users', {
        email: inviteEmail,
        firstName: inviteFirstName,
        lastName: inviteLastName,
        roleCode: inviteRole,
      });
      setInviteOpen(false);
      setInviteEmail(''); setInviteFirstName(''); setInviteLastName('');
      await mutate();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Failed to invite user');
    } finally { setInviteLoading(false); }
  };

  const handleDeactivate = async (userId: string) => {
    if (!confirm('Deactivate this user? They will lose access immediately.')) return;
    try {
      await api.post(`/organizations/me/users/${userId}/deactivate`, {});
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate user');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{locale === 'ar' ? 'المستخدمون' : 'Users'}</h1>
        <Button onClick={() => setInviteOpen(!inviteOpen)}>
          {locale === 'ar' ? 'دعوة مستخدم' : 'Invite User'}
        </Button>
      </div>

      {inviteOpen && (
        <Card>
          <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'دعوة مستخدم جديد' : 'Invite New User'}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={locale === 'ar' ? 'الاسم الأول' : 'First Name'}>
                  <Input value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} required />
                </Field>
                <Field label={locale === 'ar' ? 'اسم العائلة' : 'Last Name'}>
                  <Input value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} required />
                </Field>
              </div>
              <Field label="Email">
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required placeholder="user@example.com" />
              </Field>
              <Field label={locale === 'ar' ? 'الدور' : 'Role'}>
                <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  <option value="legal_admin">Legal Admin</option>
                  <option value="general_counsel">General Counsel</option>
                  <option value="lawyer">Lawyer</option>
                  <option value="contract_manager">Contract Manager</option>
                  <option value="business_requester">Business Requester</option>
                  <option value="finance_approver">Finance Approver</option>
                  <option value="executive_approver">Executive Approver</option>
                  <option value="auditor">Auditor</option>
                </Select>
              </Field>
              {inviteError && <p className="text-sm text-[var(--destructive)]">{inviteError}</p>}
              <div className="flex gap-2">
                <Button type="submit" loading={inviteLoading}>{locale === 'ar' ? 'إرسال الدعوة' : 'Send Invite'}</Button>
                <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4">
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={locale === 'ar' ? 'بحث بالبريد الإلكتروني أو الاسم…' : 'Search by email or name…'}
          className="max-w-sm"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {locale === 'ar' ? 'جميع المستخدمين' : 'All Users'}
            <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">({data?.meta.total ?? 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t('loading')}</p>
          ) : error ? (
            <p className="text-sm text-[var(--destructive)]">{error.message}</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t('noResults')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Email</th>
                    <th className="pb-2 pr-4 font-medium">Roles</th>
                    <th className="pb-2 pr-4 font-medium">MFA</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Last Login</th>
                    <th className="pb-2 pr-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-[var(--border)] hover:bg-[var(--muted)]">
                      <td className="py-3 pr-4 font-medium">{u.displayName}</td>
                      <td className="py-3 pr-4 text-[var(--muted-foreground)]">{u.email}</td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {u.roles?.map((r, i) => (
                            <Badge key={i} variant="outline">{r.role.code}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {u.mfaEnabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="outline">Off</Badge>}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={u.isActive ? 'success' : 'error'}>{u.status}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        {u.isActive && (
                          <Button variant="outline" size="sm" onClick={() => handleDeactivate(u.id)}>
                            {locale === 'ar' ? 'تعطيل' : 'Deactivate'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && data.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-[var(--muted-foreground)]">Page {data.meta.page} of {data.meta.totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={!data.meta.hasNext} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
