import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppApiError, requestApp } from './appClient';

afterEach(() => vi.unstubAllGlobals());

describe('동일 출처 앱 API', () => {
  it('data만 반환하고 요청을 재시도하지 않는다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: { ok: true } })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await requestApp('/api/auth/session')).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: 'same-origin',
      cache: 'no-store',
    });
  });
  it('만료와 재시도 시간을 구조화하여 전달한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'AUTH_REQUIRED',
              message: '다시 로그인해 주세요.',
              retryAfterSeconds: 10,
            },
          }),
          { status: 401 },
        ),
      ),
    );
    await expect(requestApp('/api/auth/session')).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_REQUIRED',
      retryAfterSeconds: 10,
    });
  });
  it('HTML 오류 본문을 이용자에게 노출하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('secret-provider-output', { status: 500 })),
    );
    await expect(requestApp('/api/auth/session')).rejects.toBeInstanceOf(AppApiError);
    await expect(requestApp('/api/auth/session')).rejects.not.toHaveProperty(
      'message',
      'secret-provider-output',
    );
  });
});
