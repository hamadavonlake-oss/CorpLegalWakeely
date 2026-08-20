'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/components/notifications/notification-bell';

const PUBLIC_PATHS = ['/login', '/register'];

export function AppShell({ children, locale }: { children: React.ReactNode; locale: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('nav');
  const { isAuthenticated, isLoading, user, initialize, logout } = useAuthStore();

  useEffect(() => { initialize(); }, [initialize]);

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.includes(p));

  // Redirect to login if not authenticated — must be in useEffect to avoid
  // calling router.push() during SSR (which causes "location is not defined")
  useEffect(() => {
    if (!isAuthenticated && !isPublicPath && !isLoading) {
      router.push(`/${locale}/login`);
    }
  }, [isAuthenticated, isPublicPath, isLoading, router, locale]);

  if (isLoading && !isAuthenticated && !isPublicPath) {
    return <div className="flex min-h-screen items-center justify-center"><div className="text-[var(--muted-foreground)]">Loading…</div></div>;
  }

  if (!isAuthenticated && !isPublicPath) {
    return null; // Will redirect via useEffect above
  }

  if (isPublicPath) return <>{children}</>;

  const navItems = [
    { href: `/${locale}/dashboard`, label: t('dashboard'), icon: '📊' },
    { href: `/${locale}/requests`, label: t('requests'), icon: '📋' },
    { href: `/${locale}/matters`, label: t('matters'), icon: '⚖️' },
    { href: `/${locale}/contracts`, label: t('contracts'), icon: '📝' },
    { href: `/${locale}/documents`, label: t('documents'), icon: '📄' },
    { href: `/${locale}/templates`, label: t('templates'), icon: '📑' },
    { href: `/${locale}/search`, label: t('search'), icon: '🔍' },
    { href: `/${locale}/audit`, label: t('audit'), icon: '📜' },
    { href: `/${locale}/admin/settings`, label: t('settings'), icon: '⚙️' },
    { href: `/${locale}/admin/users`, label: t('organization'), icon: '👥' },
  ];

  const handleLogout = async () => {
    await logout();
    router.push(`/${locale}/login`);
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r border-[var(--border)] bg-[var(--background)] flex-shrink-0">
        <div className="flex h-16 items-center border-b border-[var(--border)] px-6">
          <span className="text-lg font-bold">{locale === 'ar' ? 'المنصة القانونية' : 'Legal Ops'}</span>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'}`}>
                <span className="text-base">{item.icon}</span>{item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-[var(--border)] px-6">
          <div className="flex items-center gap-2">
            <a href={`/${locale}`} className={`rounded px-3 py-1 text-sm ${locale === 'ar' ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'text-[var(--muted-foreground)]'}`}>عربي</a>
            <a href={`/${locale === 'ar' ? 'en' : 'ar'}`} className={`rounded px-3 py-1 text-sm ${locale === 'en' ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'text-[var(--muted-foreground)]'}`}>English</a>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated && <NotificationBell />}
            {user && (
              <a
                href={`/${locale}/profile`}
                className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:underline"
              >
                {user.displayName || user.email}
              </a>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout}>{locale === 'ar' ? 'خروج' : 'Logout'}</Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
