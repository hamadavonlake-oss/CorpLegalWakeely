'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import { api, ApiError } from '@/lib/api-client';

const fetcher = <T>(path: string) => api.get<T>(path);

export function useApi<T>(path: string | null, config?: SWRConfiguration<T, ApiError>) {
  return useSWR<T, ApiError>(path, fetcher, { revalidateOnFocus: false, ...config });
}
