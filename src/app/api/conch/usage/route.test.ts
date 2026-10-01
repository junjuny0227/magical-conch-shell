import { describe, expect, it, vi } from 'vitest';

const handle = vi.hoisted(() => vi.fn());
vi.mock('@/features/ask-conch/index.server', () => ({ handleConchUsage: handle }));

import { GET, runtime } from './route';

describe('사용량 라우트 연결', () => {
  it('Node 런타임의 GET을 서버 공개 API로 전달한다', async () => {
    const request = new Request('http://localhost/api/conch/usage');
    const response = Response.json({ data: {} }, { headers: { 'Cache-Control': 'no-store' } });
    handle.mockResolvedValue(response);
    expect(runtime).toBe('nodejs');
    expect(await GET(request)).toBe(response);
    expect(handle).toHaveBeenCalledExactlyOnceWith(request);
  });
});
