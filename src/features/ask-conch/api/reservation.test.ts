import { describe, expect, it, vi } from 'vitest';

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

import { completeReservation, reserveRequest } from './reservation';

const input = {
  prefix: 'test',
  userId: 'user1',
  requestId: 'id1',
  question: '질문',
  owner: 'owner1',
};

describe('원자적 예약 Redis 경계', () => {
  it.each([
    null,
    {},
    { requestId: 'other', answerId: '2', answerText: '아니.' },
    { requestId: 'id1', answerId: '7', answerText: '비밀' },
    { requestId: 'id1', answerId: '2', answerText: '틀린 대사' },
  ])('손상된 성공 캐시는 안전하게 거부한다: %s', async (payload) => {
    await expect(
      reserveRequest({ eval: vi.fn().mockResolvedValue(['success', payload]) }, input),
    ).rejects.toMatchObject({ status: 503 });
  });
  it.each([null, {}, { status: 200, code: 'SECRET', message: '민감한 원문' }])(
    '손상된 오류 캐시는 안전하게 거부한다: %s',
    async (payload) => {
      await expect(
        reserveRequest({ eval: vi.fn().mockResolvedValue(['failed', payload]) }, input),
      ).rejects.toMatchObject({ status: 503 });
    },
  );
  it('질문 원문 대신 SHA256과 소유 토큰을 원자적 스크립트로 전달한다', async () => {
    const evalFn = vi.fn().mockResolvedValue(['reserved']);
    await expect(reserveRequest({ eval: evalFn }, input)).resolves.toEqual({ kind: 'reserved' });
    const [script, keys, args] = evalFn.mock.calls[0];
    expect(script).toContain('redis.call');
    expect(keys).toHaveLength(4);
    expect(args[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(args).not.toContain(input.question);
    expect(args[1]).toBe(input.owner);
  });
  it.each(['pending', 'mismatch', 'uncertain'])(
    '%s 기록은 재호출 없이 충돌로 처리한다',
    async (status) => {
      await expect(
        reserveRequest({ eval: vi.fn().mockResolvedValue([status]) }, input),
      ).rejects.toMatchObject({ status: 409 });
    },
  );
  it('완료된 결과를 그대로 재사용한다', async () => {
    const answer = { requestId: 'id1', answerId: '2', answerText: '아니.' };
    await expect(
      reserveRequest(
        { eval: vi.fn().mockResolvedValue(['success', JSON.stringify(answer)]) },
        input,
      ),
    ).resolves.toEqual({ kind: 'cached', answer });
  });
  it('SDK가 자동 역직렬화한 성공 결과도 재사용한다', async () => {
    const answer = { requestId: 'id1', answerId: '2', answerText: '아니.' };
    await expect(
      reserveRequest({ eval: vi.fn().mockResolvedValue(['success', answer]) }, input),
    ).resolves.toEqual({ kind: 'cached', answer });
  });
  it('SDK가 자동 역직렬화한 실패도 같은 상태로 보존한다', async () => {
    const error = { status: 502, code: 'UPSTREAM_ERROR', message: '답변 서비스 오류' };
    await expect(
      reserveRequest({ eval: vi.fn().mockResolvedValue(['failed', error]) }, input),
    ).rejects.toMatchObject(error);
  });
  it('제한과 Redis 장애는 닫힌 실패다', async () => {
    await expect(
      reserveRequest({ eval: vi.fn().mockResolvedValue(['limited', '10']) }, input),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 10 });
    await expect(
      reserveRequest({ eval: vi.fn().mockRejectedValue(new Error('secret')) }, input),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('완료 기록은 소유 토큰과 상태를 전달하고 모호한 호출은 슬롯을 보존한다', async () => {
    const evalFn = vi.fn().mockResolvedValue(1);
    await completeReservation({ eval: evalFn }, input, 'uncertain', {
      status: 504,
      code: 'UPSTREAM_TIMEOUT',
      message: '시간 초과',
    });
    expect(evalFn.mock.calls[0][2][0]).toBe(input.owner);
    expect(evalFn.mock.calls[0][2][1]).toBe('uncertain');
    expect(evalFn.mock.calls[0][0]).toContain("state ~= 'uncertain'");
  });
});
