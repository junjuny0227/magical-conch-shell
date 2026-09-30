'use client';

import { useRouter } from 'next/navigation';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppApiError } from '@/shared/api';

import { getAuthSession, postAuthLogout } from '../api/client';

export const authQueryKeys = {
  all: () => ['auth'] as const,
  session: () => ['auth', 'session'] as const,
};

export const useGetSession = () =>
  useQuery({
    queryKey: authQueryKeys.session(),
    queryFn: getAuthSession,
    retry: false,
    staleTime: 0,
    refetchInterval: 60_000,
  });

export const usePostLogout = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postAuthLogout,
    retry: false,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: authQueryKeys.all() });
      router.replace('/login');
      router.refresh();
    },
  });
};

export const isAuthRequired = (error: unknown) =>
  error instanceof AppApiError && error.status === 401;
