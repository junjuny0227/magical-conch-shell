import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
}));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = boundary.get;
    set = boundary.set;
    del = boundary.del;
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: boundary.cookieGet, set: boundary.cookieSet }),
}));

import {
  createSession,
  destroySession,
  getSession,
  requireSession,
  SESSION_COOKIE,
} from './session';

const user = { id: '1', name: '홍길동', objectType: 'STUDENT' as const };
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(1000000);
  vi.stubEnv('APP_ORIGIN', 'https://conch.example');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
  vi.stubEnv('REDIS_NAMESPACE', 'conch:v1:test');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe('고정 1시간 Redis 세션', () => {
  it('opaque ID만 쿠키에 저장하고 Redis 키는 SHA256이다', async () => {
    boundary.set.mockResolvedValue('OK');
    const id = await createSession(user);
    expect(id).toMatch(/^[\w-]{43}$/);
    expect(boundary.set).toHaveBeenCalledWith(
      `conch:v1:test:session:${createHash('sha256').update(id).digest('hex')}`,
      { user, expiresAt: 4600000 },
      { ex: 3600 },
    );
    expect(boundary.cookieSet).toHaveBeenCalledWith(
      SESSION_COOKIE,
      id,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 3600,
      }),
    );
  });
  it('서버 쿠키에서 세션을 읽고 TTL을 연장하지 않는다', async () => {
    boundary.cookieGet.mockReturnValue({ value: 'a'.repeat(43) });
    boundary.get.mockResolvedValue({ user, expiresAt: 4600000 });
    expect(await requireSession()).toEqual({ user, expiresAt: 4600000 });
    expect(boundary.set).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { user, expiresAt: 1000000 },
    { user, expiresAt: 999999 },
    { user: { ...user, objectType: 'ADMIN' }, expiresAt: 4600000 },
  ])('만료 또는 손상된 저장 세션은 거부', async (data) => {
    boundary.cookieGet.mockReturnValue({ value: 'a'.repeat(43) });
    boundary.get.mockResolvedValue(data);
    expect(await getSession()).toBeNull();
    await expect(requireSession()).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' });
  });
  it('잘못된 쿠키는 저장소 조회 없이 거부', async () => {
    boundary.cookieGet.mockReturnValue({ value: 'not-an-id' });
    expect(await getSession()).toBeNull();
    expect(boundary.get).not.toHaveBeenCalled();
  });
  it('Redis 장애는 미로그인으로 숨기지 않는다', async () => {
    boundary.cookieGet.mockReturnValue({ value: 'a'.repeat(43) });
    boundary.get.mockRejectedValue(new Error('secret'));
    await expect(getSession()).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });
  it('로그아웃은 세션 삭제와 쿠키 만료를 한다', async () => {
    boundary.cookieGet.mockReturnValue({ value: 'a'.repeat(43) });
    boundary.del.mockResolvedValue(1);
    await destroySession();
    expect(boundary.del).toHaveBeenCalledOnce();
    expect(boundary.cookieSet).toHaveBeenCalledWith(
      SESSION_COOKIE,
      '',
      expect.objectContaining({ maxAge: 0, httpOnly: true, secure: true, path: '/' }),
    );
  });
});
