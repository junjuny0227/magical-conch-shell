import { afterEach, expect, it, vi } from 'vitest';

import { getAuthSession, postAuthLogout } from './client';

afterEach(() => vi.unstubAllGlobals());

it('세션의 최소 사용자 정보만 조회한다', async () => {
  const data = {
    user: { id: '1', name: '테스트 학생', objectType: 'STUDENT' },
    expiresAt: 1900000000000,
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }))));
  expect(await getAuthSession()).toEqual(data);
});

it('로그아웃은 POST로 수행한다', async () => {
  const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { success: true } })));
  vi.stubGlobal('fetch', mock);
  expect(await postAuthLogout()).toEqual({ success: true });
  expect(mock).toHaveBeenCalledWith(
    '/api/auth/logout',
    expect.objectContaining({ method: 'POST' }),
  );
});
