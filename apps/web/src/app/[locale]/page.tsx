import { useTranslations } from 'next-intl';

export default function HomePage() {
  const t = useTranslations('health');

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold">{t('title')}</h2>
      <div className="rounded-lg border border-[var(--border)] p-6">
        <p className="text-[var(--muted-foreground)]">Connecting to API...</p>
      </div>
    </div>
  );
}