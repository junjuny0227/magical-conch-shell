import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/server', () => ({
  AppError: class extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

import { CONCH_DAILY_LIMIT } from '../model/usage';
import { getConchUsage, RESERVE_SCRIPT, reserveRequest, USAGE_SCRIPT } from './reservation';

const userId = 'private-user';

describe('읽기 전용 Redis 사용량 경계', () => {
  it('빈 슬롯이 있는 배열도 유효한 숫자 응답으로 취급하지 않는다', async () => {
    const raw = new Array(3);
    raw[2] = 100;
    await expect(
      getConchUsage({ eval: vi.fn().mockResolvedValue(raw) }, 'test', userId),
    ).rejects.toMatchObject({ status: 503 });
  });
  it.each([
    { raw: [0, 0, 86400], remaining: 30, retry: 0 },
    { raw: ['4', '10', '1'], remaining: 26, retry: 10 },
    { raw: [30, 7, 100], remaining: 0, retry: 100 },
    { raw: [30, 0, 1], remaining: 0, retry: 1 },
  ])(
    '신규 사용자·쿨다운·일일 한도의 대기 시간을 계산한다: $raw',
    async ({ raw, remaining, retry }) => {
      const result = await getConchUsage({ eval: vi.fn().mockResolvedValue(raw) }, 'test', userId);
      expect(result.remaining).toBe(remaining);
      expect(result.retryAfterSeconds).toBe(retry);
      expect(JSON.stringify(result)).not.toContain(userId);
    },
  );

  it.each(
    [
      null,
      {},
      [],
      [0, 0],
      [0, 0, 1, 2],
      [-1, 0, 100],
      [31, 0, 100],
      [0.5, 0, 100],
      [0, -1, 100],
      [0, -2, 100],
      [0, 11, 100],
      [0, 0.1, 100],
      [0, 0, 0],
      [0, 0, 86401],
      [0, 0, 1.5],
      [NaN, 0, 100],
      [Infinity, 0, 100],
      [Number.MAX_SAFE_INTEGER + 1, 0, 100],
      [null, 0, 100],
      [false, 0, 100],
      ['', 0, 100],
      [' 0', 0, 100],
      ['1e1', 0, 100],
      ['0x1', 0, 100],
      [[], 0, 100],
    ].map((raw) => ({ raw })),
  )('손상되거나 범위를 벗어난 응답은 503으로 거부한다: $raw', async ({ raw }) => {
    await expect(
      getConchUsage({ eval: vi.fn().mockResolvedValue(raw) }, 'test', userId),
    ).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });

  it('Redis 장애 원문을 노출하지 않는다', async () => {
    await expect(
      getConchUsage({ eval: vi.fn().mockRejectedValue(new Error('secret')) }, 'test', userId),
    ).rejects.toMatchObject({ status: 503, message: '잠시 후 다시 시도해 주세요.' });
  });

  it('Lua는 서버 시계와 KST 날짜를 사용하며 읽기 명령만 실행한다', () => {
    const commands = [...USAGE_SCRIPT.matchAll(/redis\.call\('([^']+)'/g)].map((match) => match[1]);
    expect(commands).toEqual(['TIME', 'GET', 'TTL']);
    expect(USAGE_SCRIPT).toContain('seconds + 32400');
    expect(USAGE_SCRIPT).toContain("':day:' .. day");
    expect(USAGE_SCRIPT).toContain('cooldown == -2 then cooldown = 0');
    expect(USAGE_SCRIPT).toContain('redis.error_reply');
  });

  it('예약과 같은 해시 사용자 키에서 한 번의 원자적 조회로 사용량을 반환한다', async () => {
    const evalFn = vi.fn().mockResolvedValue([3, 0, 1234]);
    await expect(getConchUsage({ eval: evalFn }, 'test', userId)).resolves.toEqual({
      dailyLimit: CONCH_DAILY_LIMIT,
      remaining: CONCH_DAILY_LIMIT - 3,
      retryAfterSeconds: 0,
      resetAfterSeconds: 1234,
    });
    const hash = createHash('sha256').update(userId).digest('hex');
    expect(evalFn).toHaveBeenCalledExactlyOnceWith(USAGE_SCRIPT, [`test:{conch}:user:${hash}`], []);
    const reserveEval = vi.fn().mockResolvedValue(['reserved']);
    await reserveRequest(
      { eval: reserveEval },
      { prefix: 'test', userId, requestId: 'id', question: '질문', owner: 'owner' },
    );
    expect(reserveEval.mock.calls[0][1][1]).toBe(evalFn.mock.calls[0][1][0]);
    expect(RESERVE_SCRIPT).toContain(`>= ${CONCH_DAILY_LIMIT} then`);
  });
});
