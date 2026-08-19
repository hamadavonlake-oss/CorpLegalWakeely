import { getRequestConfig } from 'next-intl/server';
import { SUPPORTED_LOCALES } from '@glo/shared';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !SUPPORTED_LOCALES.includes(locale as any)) {
    locale = 'ar';
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
