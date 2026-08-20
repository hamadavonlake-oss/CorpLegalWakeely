'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

export default function HomePage() {
  const router = useRouter();
  const { initialize } = useAuthStore();
  useEffect(() => {
    initialize().then(() => {
      const { isAuthenticated: authed } = useAuthStore.getState();
      router.push(authed ? '/dashboard' : '/login');
    });
  }, [initialize, router]);
  return <div className="flex min-h-screen items-center justify-center"><div className="text-[var(--muted-foreground)]">Loading…</div></div>;
}
