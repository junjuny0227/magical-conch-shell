'use client';

import { useQuery } from '@tanstack/react-query';

import { requestApp } from '@/shared/api';

import type { ConchUsageType } from './usage';

export const conchUsageQueryKeys = {
  all: () => ['conch-usage'] as const,
  user: (userId?: string) => ['conch-usage', userId] as const,
};

export const useGetConchUsage = (userId?: string) =>
  useQuery({
    queryKey: conchUsageQueryKeys.user(userId),
    queryFn: () => requestApp<ConchUsageType>('/api/conch/usage'),
    enabled: Boolean(userId),
    retry: false,
    staleTime: 0,
    refetchInterval: (query) =>
      Math.min(60_000, (query.state.data?.resetAfterSeconds ?? 60) * 1000 + 100),
    refetchOnWindowFocus: 'always',
  });
