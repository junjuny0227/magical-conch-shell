import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAppOrigin, getAuthConfig } from '@/shared/config/server';

import { AppError, assertOrigin, errorResponse, getRedis, keyPrefix } from './server';

afterEach(() => vi.unstubAllEnvs());
describe('서버 경계', () => {
  it('설정 누락은 안전한 503이다', async () => {
    vi.stubEnv('APP_ORIGIN', '');
    expect(() => getAuthConfig()).toThrow(AppError);
    const response = errorResponse(
      new AppError(503, 'SERVICE_UNAVAILABLE', '일시적으로 사용할 수 없습니다.'),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: '일시적으로 사용할 수 없습니다.' },
    });
  });
  it('알 수 없는 예외의 원문을 감춘다', async () => {
    const response = errorResponse(new Error('secret-token'));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('secret-token');
  });
  it('고정 동일 출처 callback만 허용한다', () => {
    vi.stubEnv('APP_ORIGIN', 'https://conch.example');
    vi.stubEnv('DATAGSM_CLIENT_ID', 'test-client');
    vi.stubEnv('DATAGSM_REDIRECT_URI', 'https://conch.example/api/auth/callback');
    expect(getAuthConfig()).toEqual({
      appOrigin: 'https://conch.example',
      clientId: 'test-client',
      redirectUri: 'https://conch.example/api/auth/callback',
    });
    vi.stubEnv('DATAGSM_REDIRECT_URI', 'https://evil.example/api/auth/callback');
    expect(() => getAuthConfig()).toThrow(AppError);
  });
  it.each([
    'http://conch.example',
    'https://conch.example/path',
    'https://user:pass@conch.example',
    'https://conch.example?x=1',
  ])('잘못된 origin %s 거부', (origin) => {
    vi.stubEnv('APP_ORIGIN', origin);
    expect(() => getAppOrigin()).toThrow(AppError);
  });
  it('localhost 개발과 정확한 Origin 비교', () => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
    expect(getAppOrigin()).toBe('http://localhost:3000');
    expect(() =>
      assertOrigin(
        new Request('http://localhost:3000', { headers: { origin: 'http://localhost:3000' } }),
      ),
    ).not.toThrow();
    expect(() => assertOrigin(new Request('http://localhost:3000'))).toThrow(AppError);
    expect(() =>
      assertOrigin(
        new Request('http://localhost:3000', { headers: { origin: 'http://localhost:3000/' } }),
      ),
    ).toThrow(AppError);
  });
  it('운영 namespace 명시와 Redis 필수 설정', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('REDIS_NAMESPACE', '');
    expect(keyPrefix()).toBe('conch:v1:development');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => keyPrefix()).toThrow(AppError);
    vi.stubEnv('REDIS_NAMESPACE', 'conch:v1:production');
    expect(keyPrefix()).toBe('conch:v1:production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    expect(() => getRedis()).toThrow(AppError);
  });
  it('제한 응답은 Retry-After를 전달한다', async () => {
    const response = errorResponse(
      new AppError(429, 'RATE_LIMITED', '잠시 후 다시 시도하세요.', 60),
    );
    expect(response.headers.get('retry-after')).toBe('60');
    expect((await response.json()).error.retryAfterSeconds).toBe(60);
  });
});
