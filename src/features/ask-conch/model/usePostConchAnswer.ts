'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { AppApiError, requestApp } from '@/shared/api';

import type { ConchAnswerReqType, ConchAnswerType } from './question';
import { conchUsageQueryKeys } from './useGetConchUsage';

export const usePostConchAnswer = () => {
  const queryClient = useQueryClient();
  return useMutation<ConchAnswerType, AppApiError, ConchAnswerReqType>({
    mutationFn: async (input) => {
      const response = await requestApp<ConchAnswerType>('/api/conch/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return response;
    },
    retry: false,
    onSettled: () => {
      // 예약 이후 upstream 실패도 기존 정책대로 횟수를 소모할 수 있다.
      void queryClient.invalidateQueries({ queryKey: conchUsageQueryKeys.all() });
    },
  });
};
