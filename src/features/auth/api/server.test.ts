import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  eval: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
}));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    eval = boundary.eval;
    set = boundary.set;
    del = boundary.del;
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: boundary.cookieGet, set: boundary.cookieSet }),
}));

import { startLogin } from './server';

beforeEach(() => {
  vi.clearAllMocks();
  boundary.eval.mockResolvedValue(1);
  boundary.set.mockResolvedValue('OK');
  vi.stubEnv('APP_ORIGIN', 'https://conch.example');
  vi.stubEnv('DATAGSM_CLIENT_ID', 'test-client');
  vi.stubEnv('DATAGSM_REDIRECT_URI', 'https://conch.example/api/auth/callback');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test');
  vi.stubEnv('REDIS_NAMESPACE', 'conch:v1:test');
});
afterEach(() => vi.unstubAllEnvs());
describe('OAuth 시작', () => {
  it('서버 거래를 5분 저장하고 고정 PKCE 인증 URL로 이동한다', async () => {
    const response = await startLogin(
      new Request('https://conch.example/api/auth/login?next=https://evil.example', {
        headers: { 'x-forwarded-for': 'attacker' },
      }),
    );
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.get('location')!);
    expect(redirect.origin + redirect.pathname).toBe(
      'https://oauth.authorization.datagsm.kr/v1/oauth/authorize',
    );
    expect(redirect.searchParams.get('redirect_uri')).toBe(
      'https://conch.example/api/auth/callback',
    );
    expect(redirect.searchParams.get('code_challenge_method')).toBe('S256');
    expect(redirect.searchParams.get('state')).toMatch(/^[\w-]{43}$/);
    expect(boundary.set).toHaveBeenCalledWith(
      expect.stringMatching(/:oauth:transaction:[a-f0-9]{64}$/),
      expect.objectContaining({
        state: redirect.searchParams.get('state'),
        verifier: expect.stringMatching(/^[\w-]{43}$/),
        expiresAt: expect.any(Number),
      }),
      { ex: 300 },
    );
    expect(boundary.cookieSet).toHaveBeenCalledWith(
      'conch_oauth_transaction',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 300,
      }),
    );
    expect(JSON.stringify(boundary.eval.mock.calls)).not.toContain('attacker');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('원자적 공용/브라우저 제한 실패 시 거래를 생성하지 않는다', async () => {
    boundary.eval.mockResolvedValue(0);
    const response = await startLogin(new Request('https://conch.example/api/auth/login'));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(boundary.set).not.toHaveBeenCalled();
  });
  it('저장소 오류는 503이며 원문을 노출하지 않는다', async () => {
    boundary.eval.mockRejectedValue(new Error('private Redis URL'));
    const response = await startLogin(new Request('https://conch.example/api/auth/login'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
  });
  it('설정 누락과 위조 요청 origin은 안전하게 거부한다', async () => {
    expect((await startLogin(new Request('https://evil.example/api/auth/login'))).status).toBe(403);
    vi.stubEnv('DATAGSM_CLIENT_ID', '');
    expect((await startLogin(new Request('https://conch.example/api/auth/login'))).status).toBe(
      503,
    );
  });
});
