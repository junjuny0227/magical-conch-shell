import { Redis } from '@upstash/redis';

import { getAppOrigin } from '@/shared/config/server';

import 'server-only';
import { AppError, serviceUnavailable } from './serverErrors';
export { AppError, errorResponse, serviceUnavailable } from './serverErrors';
// shared/config의 서버 설정을 서버 공개 진입점에서도 제공한다.
export { getAppOrigin, getAuthConfig } from '@/shared/config/server';

export const assertOrigin = (request: Request): void => {
  if (request.headers.get('origin') !== getAppOrigin())
    throw new AppError(403, 'ACCESS_DENIED', '허용되지 않은 요청입니다.');
};
export const keyPrefix = (): string => {
  const namespace = process.env.REDIS_NAMESPACE;
  if (namespace) {
    if (
      !/^[a-zA-Z0-9:_-]{1,100}$/.test(namespace) ||
      (process.env.NODE_ENV === 'production' && namespace === 'conch:v1:development')
    )
      throw serviceUnavailable();
    return namespace;
  }
  if (process.env.NODE_ENV === 'production') throw serviceUnavailable();
  return 'conch:v1:development';
};
export const getRedis = (): Redis => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    if (!url || !token || new URL(url).protocol !== 'https:') throw new Error();
    return new Redis({
      url,
      token,
      retry: false,
      signal: () => AbortSignal.timeout(5000),
      automaticDeserialization: true,
    });
  } catch {
    throw serviceUnavailable();
  }
};
export const withRedis = async <T>(operation: (redis: Redis) => Promise<T>): Promise<T> => {
  try {
    return await operation(getRedis());
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw serviceUnavailable();
  }
};
