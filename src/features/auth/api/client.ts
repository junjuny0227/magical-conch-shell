import type { SessionType } from '@/entities/account';
import { requestApp } from '@/shared/api';

export const getAuthSession = () => requestApp<SessionType>('/api/auth/session');
export const postAuthLogout = () =>
  requestApp<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
