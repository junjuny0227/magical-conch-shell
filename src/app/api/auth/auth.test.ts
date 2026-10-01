import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  getdel: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    getdel = boundary.getdel;
    get = boundary.get;
    set = boundary.set;
    del = boundary.del;
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: boundary.cookieGet, set: boundary.cookieSet }),
}));

import { GET as callback } from '@/app/api/auth/callback/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as session } from '@/app/api/auth/session/route';

const state = 's'.repeat(43);
const id = 'a'.repeat(43);
const student = {
  id: 1,
  status: 'ACTIVE',
  objectType: 'STUDENT',
  student: { name: '홍길동', role: 'GENERAL_STUDENT', isLeaveSchool: false },
};
const callbackRequest = (
  query = `code=one-use-code&state=${state}`,
  origin = 'https://conch.example',
) => new Request(`${origin}/api/auth/callback?${query}`);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', boundary.fetch);
  vi.stubEnv('APP_ORIGIN', 'https://conch.example');
  vi.stubEnv('DATAGSM_CLIENT_ID', 'test-client');
  vi.stubEnv('DATAGSM_REDIRECT_URI', 'https://conch.example/api/auth/callback');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test');
  vi.stubEnv('REDIS_NAMESPACE', 'conch:v1:test');
  boundary.cookieGet.mockImplementation((name: string) =>
    name === 'conch_oauth_transaction' ? { value: id } : undefined,
  );
  boundary.getdel.mockResolvedValue({
    state,
    verifier: 'v'.repeat(43),
    expiresAt: Date.now() + 300000,
  });
  boundary.set.mockResolvedValue('OK');
  boundary.fetch
    .mockResolvedValueOnce(
      Response.json({ access_token: 'test-access-token', token_type: 'Bearer', expires_in: 3600 }),
    )
    .mockResolvedValueOnce(Response.json(student));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('OAuth 콜백과 앱 인증 라우트', () => {
  it('isLeaveSchool이 없는 현재 userinfo 형태로도 세션을 만들고 홈으로 이동한다', async () => {
    boundary.fetch
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'test-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...student,
          student: { name: student.student.name, role: 'GENERAL_STUDENT' },
        }),
      );
    const response = await callback(callbackRequest());
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://conch.example/');
    expect(boundary.set).toHaveBeenCalledWith(
      expect.stringMatching(/:session:[a-f0-9]{64}$/),
      expect.objectContaining({
        user: { id: '1', name: student.student.name, objectType: 'STUDENT' },
      }),
      { ex: 3600 },
    );
    expect(JSON.stringify(boundary.set.mock.calls)).not.toContain('test-access-token');
  });
  it.each([
    [0, 'TOKEN_FORBIDDEN'],
    [1, 'USERINFO_FORBIDDEN'],
  ])('개발 환경에서 외부 403의 실패 단계를 구분한다', async (failedStep, reason) => {
    vi.stubEnv('NODE_ENV', 'development');
    boundary.fetch.mockReset();
    if (failedStep === 1)
      boundary.fetch.mockResolvedValueOnce(
        Response.json({ access_token: 'private-token', token_type: 'Bearer', expires_in: 3600 }),
      );
    boundary.fetch.mockResolvedValueOnce(new Response('private-provider-body', { status: 403 }));
    const response = await callback(callbackRequest());
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('error')).toBe('ACCESS_DENIED');
    expect(location.searchParams.get('reason')).toBe(reason);
    expect(location.href).not.toContain('private');
    expect(boundary.set).not.toHaveBeenCalled();
  });
  it('개발 환경에서 callback 출처 불일치를 구분한다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = await callback(callbackRequest(undefined, 'https://evil.example'));
    expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe(
      'CALLBACK_ORIGIN_MISMATCH',
    );
  });
  it('개발 환경에서 계정 자격 검사 사유를 구분한다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    boundary.fetch
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({ access_token: 'private-token', token_type: 'Bearer', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        Response.json({ ...student, student: { ...student.student, role: 'GRADUATE' } }),
      );
    const response = await callback(callbackRequest());
    expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe(
      'STUDENT_ROLE_INVALID',
    );
    expect(boundary.set).not.toHaveBeenCalled();
  });
  it('운영 환경에는 거절 세부 사유를 노출하지 않는다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    boundary.fetch
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({ access_token: 'private-token', token_type: 'Bearer', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(Response.json({ ...student, status: 'PENDING' }));
    const response = await callback(callbackRequest());
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('error')).toBe('ACCESS_DENIED');
    expect(location.searchParams.has('reason')).toBe(false);
  });
  it('토큰 endpoint의 client 인증 실패는 앱 재로그인이 아니라 서비스 장애다', async () => {
    boundary.fetch
      .mockReset()
      .mockResolvedValue(new Response('private invalid_client', { status: 401 }));
    const response = await callback(callbackRequest());
    expect(response.headers.get('location')).toBe(
      'https://conch.example/login?error=SERVICE_UNAVAILABLE',
    );
    expect(boundary.set).not.toHaveBeenCalled();
  });
  it('일회성 거래 소비 → JSON PKCE 교환 → 사용자 검사 → opaque 세션', async () => {
    const response = await callback(callbackRequest());
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://conch.example/');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(boundary.getdel).toHaveBeenCalledOnce();
    const [url, options] = boundary.fetch.mock.calls[0];
    expect(url).toBe('https://oauth.authorization.datagsm.kr/v1/oauth/token');
    expect(JSON.parse(options.body)).toEqual({
      grant_type: 'authorization_code',
      code: 'one-use-code',
      client_id: 'test-client',
      redirect_uri: 'https://conch.example/api/auth/callback',
      code_verifier: 'v'.repeat(43),
    });
    expect(boundary.fetch.mock.calls[1][0]).toBe('https://oauth.resource.datagsm.kr/userinfo');
    expect(boundary.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer test-access-token');
    expect(boundary.set).toHaveBeenCalledWith(
      expect.stringMatching(/:session:[a-f0-9]{64}$/),
      expect.objectContaining({ user: { id: '1', name: '홍길동', objectType: 'STUDENT' } }),
      { ex: 3600 },
    );
    expect(JSON.stringify(boundary.set.mock.calls)).not.toContain('test-access-token');
    expect(boundary.cookieSet).toHaveBeenCalledWith(
      'conch_oauth_transaction',
      '',
      expect.objectContaining({ maxAge: 0 }),
    );
  });
  it('동일 callback 재사용은 외부 호출 없이 거부한다', async () => {
    boundary.getdel
      .mockResolvedValueOnce({ state, verifier: 'v'.repeat(43), expiresAt: Date.now() + 300000 })
      .mockResolvedValueOnce(null);
    await callback(callbackRequest());
    boundary.fetch.mockClear();
    const response = await callback(callbackRequest());
    expect(response.headers.get('location')).toBe(
      'https://conch.example/login?error=AUTH_REQUIRED',
    );
    expect(boundary.fetch).not.toHaveBeenCalled();
  });
  it.each([
    'code=x',
    `code=x&state=${'z'.repeat(43)}`,
    `code=x&code=y&state=${state}`,
    `error=access_denied&state=${state}`,
    `code=&state=${state}`,
  ])('잘못된 callback %s 거부', async (query) => {
    const response = await callback(callbackRequest(query));
    expect(response.headers.get('location')).toContain('/login?error=AUTH_REQUIRED');
    expect(boundary.fetch).not.toHaveBeenCalled();
  });
  it('5분 만료를 Redis TTL과 별도로 검사한다', async () => {
    boundary.getdel.mockResolvedValue({
      state,
      verifier: 'v'.repeat(43),
      expiresAt: Date.now() - 1,
    });
    expect((await callback(callbackRequest())).headers.get('location')).toContain(
      'error=AUTH_REQUIRED',
    );
    expect(boundary.fetch).not.toHaveBeenCalled();
  });
  it('거래 쿠키 누락은 저장소나 외부 호출 없이 거부한다', async () => {
    boundary.cookieGet.mockReturnValue(undefined);
    expect((await callback(callbackRequest())).headers.get('location')).toContain(
      'error=AUTH_REQUIRED',
    );
    expect(boundary.getdel).not.toHaveBeenCalled();
    expect(boundary.fetch).not.toHaveBeenCalled();
  });
  it('위조 origin은 고정 앱 오류 화면만 사용한다', async () => {
    const response = await callback(callbackRequest(undefined, 'https://evil.example'));
    expect(response.headers.get('location')).toBe(
      'https://conch.example/login?error=ACCESS_DENIED',
    );
    expect(boundary.fetch).not.toHaveBeenCalled();
  });
  it('졸업생과 미승인 선생님은 세션을 만들지 않는다', async () => {
    boundary.fetch
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({ access_token: 'test', token_type: 'Bearer', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        Response.json({ ...student, student: { ...student.student, role: 'GRADUATE' } }),
      );
    expect((await callback(callbackRequest())).headers.get('location')).toContain(
      'error=ACCESS_DENIED',
    );
    expect(boundary.set).not.toHaveBeenCalled();
  });
  it.each([
    Response.json({ token_type: 'Bearer' }),
    new Response('not-json'),
    Response.json({ access_token: 'test', token_type: 'other', expires_in: 3600 }),
    new Response('secret error', { status: 500 }),
  ])('손상된 upstream 응답을 안전하게 전달한다', async (upstream) => {
    boundary.fetch.mockReset().mockResolvedValue(upstream);
    const response = await callback(callbackRequest());
    expect(response.headers.get('location')).toBe(
      'https://conch.example/login?error=UPSTREAM_ERROR',
    );
    expect(boundary.set).not.toHaveBeenCalled();
  });
  it('Redis 장애와 설정 누락을 숨기지 않는다', async () => {
    boundary.getdel.mockRejectedValue(new Error('secret'));
    expect((await callback(callbackRequest())).headers.get('location')).toContain(
      'error=SERVICE_UNAVAILABLE',
    );
    vi.stubEnv('DATAGSM_CLIENT_ID', '');
    const response = await callback(callbackRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('DATAGSM');
  });
  it('세션 응답은 data envelope이며 미로그인은 401', async () => {
    expect((await session()).status).toBe(401);
    boundary.cookieGet.mockImplementation((name: string) =>
      name === 'conch_session' ? { value: id } : undefined,
    );
    const stored = {
      user: { id: '1', name: '홍길동', objectType: 'STUDENT' },
      expiresAt: Date.now() + 3600000,
    };
    boundary.get.mockResolvedValue(stored);
    const response = await session();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: stored });
  });
  it('로그아웃은 정확한 Origin 확인 후 세션을 폐기한다', async () => {
    expect(
      (await logout(new Request('https://conch.example/api/auth/logout', { method: 'POST' })))
        .status,
    ).toBe(403);
    boundary.cookieGet.mockImplementation((name: string) =>
      name === 'conch_session' ? { value: id } : undefined,
    );
    boundary.del.mockResolvedValue(1);
    const response = await logout(
      new Request('https://conch.example/api/auth/logout', {
        method: 'POST',
        headers: { origin: 'https://conch.example' },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { success: true } });
    expect(boundary.del).toHaveBeenCalledOnce();
  });
});
