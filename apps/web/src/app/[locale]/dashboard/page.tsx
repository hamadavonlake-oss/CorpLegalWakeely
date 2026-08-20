'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusToVariant } from '@/components/ui/badge';
import { useApi } from '@/lib/use-api';
import { useAuthStore } from '@/stores/auth-store';
import Link from 'next/link';
import { useLocale } from 'next-intl';

interface PaginatedResponse<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean }; }
interface LegalRequest { id: string; requestNumber: string; title: string; titleEn?: string; status: string; priority: string; type?: string; createdAt: string; }
interface Matter { id: string; matterNumber: string; title: string; titleEn?: string; status: string; priority: string; type?: string; createdAt: string; }
interface Contract { id: string; contractNumber: string; title: string; titleEn?: string; status: string; priority: string; type?: string; totalValue?: string; totalCurrency?: string; createdAt: string; }

export default function DashboardPage() {
  const tc = useTranslations('common');
  const locale = useLocale();
  const { user } = useAuthStore();
  const { data: requestsData } = useApi<PaginatedResponse<LegalRequest>>('/legal-requests?limit=5');
  const { data: mattersData } = useApi<PaginatedResponse<Matter>>('/matters?limit=5');
  const { data: contractsData } = useApi<PaginatedResponse<Contract>>('/contracts?limit=5');
  const recentRequests = requestsData?.data ?? [];
  const recentMatters = mattersData?.data ?? [];
  const recentContracts = contractsData?.data ?? [];
  const stats = [
    { label: 'Open Requests', value: recentRequests.length, href: '/requests' },
    { label: 'Active Matters', value: recentMatters.length, href: '/matters' },
    { label: 'Contracts', value: recentContracts.length, href: '/contracts' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{locale === 'ar' ? 'لوحة التحكم' : 'Dashboard'}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">{user ? `${locale === 'ar' ? 'مرحباً' : 'Welcome back'}, ${user.displayName || user.email}` : ''}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:border-[var(--primary)] transition-colors cursor-pointer">
              <CardContent className="p-6">
                <p className="text-sm text-[var(--muted-foreground)]">{stat.label}</p>
                <p className="text-3xl font-bold">{stat.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'أحدث الطلبات' : 'Recent Requests'}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {recentRequests.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">{tc('noResults')}</p> : recentRequests.map((req) => (
              <Link key={req.id} href={`/requests/${req.id}`} className="block rounded p-2 hover:bg-[var(--muted)] transition-colors">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{locale === 'ar' ? req.title : (req.titleEn || req.title)}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{req.requestNumber}</p>
                  </div>
                  <Badge variant={statusToVariant(req.status)}>{req.status}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'أحدث القضايا' : 'Recent Matters'}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {recentMatters.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">{tc('noResults')}</p> : recentMatters.map((matter) => (
              <Link key={matter.id} href={`/matters/${matter.id}`} className="block rounded p-2 hover:bg-[var(--muted)] transition-colors">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{locale === 'ar' ? matter.title : (matter.titleEn || matter.title)}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{matter.matterNumber}</p>
                  </div>
                  <Badge variant={statusToVariant(matter.status)}>{matter.status}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'أحدث العقود' : 'Recent Contracts'}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {recentContracts.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">{tc('noResults')}</p> : recentContracts.map((contract) => (
              <Link key={contract.id} href={`/contracts/${contract.id}`} className="block rounded p-2 hover:bg-[var(--muted)] transition-colors">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{locale === 'ar' ? contract.title : (contract.titleEn || contract.title)}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{contract.contractNumber}</p>
                  </div>
                  <Badge variant={statusToVariant(contract.status)}>{contract.status}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
