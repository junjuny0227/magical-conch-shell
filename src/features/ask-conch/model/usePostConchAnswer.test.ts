import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requestApp: vi.fn(), useMutation: vi.fn((options) => options) }));
vi.mock('@tanstack/react-query', () => ({ useMutation: mocks.useMutation }));
vi.mock('@/shared/api', () => ({ requestApp: mocks.requestApp }));

import { usePostConchAnswer } from './usePostConchAnswer';

it('질문 mutation은 자동 재시도 없이 공유 앱 클라이언트의 data를 반환한다', async () => {
  const input = { question: '질문', requestId: 'request-id' };
  const answer = { requestId: input.requestId, answerId: '2', answerText: '아니.' };
  mocks.requestApp.mockResolvedValue(answer);
  usePostConchAnswer();
  const options = mocks.useMutation.mock.calls[0][0];
  expect(options.retry).toBe(false);
  expect(await options.mutationFn(input)).toEqual(answer);
  expect(mocks.requestApp).toHaveBeenCalledWith(
    '/api/conch/answer',
    expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
  );
});

describe('공유 API 오류 보존', () => {
  it('401 에러 인스턴스를 감싸지 않고 UI에 전달한다', async () => {
    const error = new Error('로그인 필요');
    mocks.requestApp.mockRejectedValueOnce(error);
    usePostConchAnswer();
    const options = mocks.useMutation.mock.calls.at(-1)![0];
    await expect(options.mutationFn({ question: '질문', requestId: 'id' })).rejects.toBe(error);
  });
});
