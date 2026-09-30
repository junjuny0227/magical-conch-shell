import { expect, it, vi } from 'vitest';

const handler = vi.hoisted(() => vi.fn());
vi.mock('@/features/ask-conch/index.server', () => ({ handleConchAnswer: handler }));

import { POST } from './route';

it('POST는 기능 공개 API에 요청을 그대로 전달한다', async () => {
  const request = new Request('http://localhost/api/conch/answer', { method: 'POST' });
  const response = Response.json({ data: {} });
  handler.mockResolvedValue(response);
  expect(await POST(request)).toBe(response);
  expect(handler).toHaveBeenCalledWith(request);
});
