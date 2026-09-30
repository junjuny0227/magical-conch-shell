import { afterEach, describe, expect, it, vi } from 'vitest';

import { jebFixture } from '../model/jebFixture';
import { requestJebAnswer } from './jeb';

vi.mock('@/shared/lib/server', () => ({
  AppError: class extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
      public retryAfterSeconds?: number,
    ) {
      super(message);
    }
  },
}));
vi.mock('@/entities/conch', () => ({
  CONCH_ANSWERS: {
    '1': '응.',
    '2': '아니.',
    '3': '어쩌면 언젠가는.',
    '4': '다시 물어봐.',
    '5': '아무것도 하지 마.',
    '6': '둘 다 안 돼.',
  },
}));
afterEach(() => vi.useRealTimers());

describe('Jeb 단일 호출', () => {
  it('질문만 보내고 고정 choice를 매핑한다', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(jebFixture));
    expect(await requestJebAnswer('갈까?', 'fixture-key', fetcher)).toBe('2');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.state).toEqual({ question: '갈까?' });
    expect(Object.keys(body.questions.conch_answer.criteria)).toHaveLength(6);
  });
  it.each([
    [401, 503],
    [422, 502],
    [429, 429],
    [500, 502],
    [503, 502],
    [403, 502],
  ])('upstream %s는 앱 %s로 정제한다', async (upstream, status) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('secret-key-and-provider-body', { status: upstream }));
    await expect(requestJebAnswer('질문', 'fixture-key', fetcher)).rejects.toMatchObject({
      status,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('깨진 JSON은 정상 대사로 위장하지 않는다', async () => {
    await expect(
      requestJebAnswer('질문', 'fixture-key', vi.fn().mockResolvedValue(new Response('not json'))),
    ).rejects.toMatchObject({ status: 502 });
  });
  it('네트워크 오류는 불명확한 결과로 취급한다', async () => {
    await expect(
      requestJebAnswer('질문', 'fixture-key', vi.fn().mockRejectedValue(new TypeError('secret'))),
    ).rejects.toMatchObject({ status: 502, uncertain: true });
  });
  it('10초에 응답 본문까지 중단하고 자동 재시도하지 않는다', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    const result = requestJebAnswer('질문', 'fixture-key', fetcher);
    const assertion = expect(result).rejects.toMatchObject({ status: 504, uncertain: true });
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
