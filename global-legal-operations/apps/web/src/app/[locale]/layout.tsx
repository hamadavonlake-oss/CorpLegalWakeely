import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { notFound } from 'next/navigation';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NextIntlClientProvider messages={messages}>
          <header className="border-b border-[var(--border)] px-6 py-4">
            <div className="mx-auto flex max-w-7xl items-center justify-between">
              <h1 className="text-lg font-semibold">
                {locale === 'ar' ? 'المنصة القانونية' : 'Legal Platform'}
              </h1>
              <div className="flex gap-2">
                <a
                  href="/ar"
                  className={`rounded px-3 py-1 text-sm ${locale === 'ar' ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'text-[var(--muted-foreground)]'}`}
                >
                  عربي
                </a>
                <a
                  href="/en"
                  className={`rounded px-3 py-1 text-sm ${locale === 'en' ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'text-[var(--muted-foreground)]'}`}
                >
                  English
                </a>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-6 py-8">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}