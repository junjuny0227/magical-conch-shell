'use client';

import { useMutation } from '@tanstack/react-query';

import { AppApiError, requestApp } from '@/shared/api';

import type { ConchAnswerReqType, ConchAnswerType } from './question';

export const usePostConchAnswer = () =>
  useMutation<ConchAnswerType, AppApiError, ConchAnswerReqType>({
    mutationFn: async (input) => {
      const response = await requestApp<ConchAnswerType>('/api/conch/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return response;
    },
    retry: false,
  });
