import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({ session: vi.fn(), getRedis: vi.fn(), redis: { eval: vi.fn() } }));
vi.mock('@/entities/account/index.server', () => ({ requireSession: deps.session }));
vi.mock('@/shared/lib/server', async () => ({
  ...(await import('@/shared/lib/serverErrors')),
  getRedis: deps.getRedis,
  keyPrefix: () => 'test',
}));

import { AppError } from '@/shared/lib/server';

import { handleConchUsage } from './handleConchUsage';

beforeEach(() => {
  vi.resetAllMocks();
  deps.session.mockResolvedValue({ user: { id: 'session-user', name: '비공개 이름' } });
  deps.getRedis.mockReturnValue(deps.redis);
  deps.redis.eval.mockResolvedValue([5, 0, 500]);
});

describe('인증된 사용량 GET 라우트', () => {
  it('미인증 요청은 Redis 클라이언트 생성과 사용량 조회 전에 401로 종료한다', async () => {
    deps.session.mockRejectedValue(new AppError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.'));
    const response = await handleConchUsage(new Request('http://localhost/api/conch/usage'));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' },
    });
    expect(deps.getRedis).not.toHaveBeenCalled();
    expect(deps.redis.eval).not.toHaveBeenCalled();
  });

  it.each(['세션', '클라이언트', '조회', '손상'])(
    '%s 장애도 캐시하지 않고 오류 원문을 숨긴다',
    async (kind) => {
      if (kind === '세션')
        deps.session.mockRejectedValue(
          new AppError(503, 'SERVICE_UNAVAILABLE', '잠시 후 다시 시도해 주세요.'),
        );
      if (kind === '클라이언트')
        deps.getRedis.mockImplementation(() => {
          throw new AppError(503, 'SERVICE_UNAVAILABLE', '잠시 후 다시 시도해 주세요.');
        });
      if (kind === '조회') deps.redis.eval.mockRejectedValue(new Error('Redis secret'));
      if (kind === '손상') deps.redis.eval.mockResolvedValue([31, 0, 500]);
      const response = await handleConchUsage(new Request('http://localhost/api/conch/usage'));
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect((await response.json()).error.code).toBe('SERVICE_UNAVAILABLE');
    },
  );

  it('예상하지 못한 오류는 공통 errorResponse로 안전하게 반환한다', async () => {
    deps.session.mockRejectedValue(new Error('session secret'));
    const response = await handleConchUsage(new Request('http://localhost/api/conch/usage'));
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' },
    });
  });

  it('쿼터를 모두 써도 사용량 조회는 200으로 남은 횟수와 초기화 시간을 반환한다', async () => {
    deps.redis.eval.mockResolvedValue([30, 10, 500]);
    const response = await handleConchUsage(new Request('http://localhost/api/conch/usage'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      data: { dailyLimit: 30, remaining: 0, retryAfterSeconds: 500, resetAfterSeconds: 500 },
    });
    expect(deps.redis.eval).toHaveBeenCalledOnce();
  });

  it('URL 사용자 ID 대신 세션 사용자만 조회하며 응답과 캐시에서 개인정보를 숨긴다', async () => {
    const response = await handleConchUsage(
      new Request('http://localhost/api/conch/usage?userId=another-user'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      data: { dailyLimit: 30, remaining: 25, retryAfterSeconds: 0, resetAfterSeconds: 500 },
    });
    expect(deps.session).toHaveBeenCalledOnce();
    expect(deps.session.mock.invocationCallOrder[0]).toBeLessThan(
      deps.getRedis.mock.invocationCallOrder[0],
    );
    const hash = createHash('sha256').update('session-user').digest('hex');
    expect(deps.redis.eval.mock.calls[0][1]).toEqual([`test:{conch}:user:${hash}`]);
    expect(deps.redis.eval).toHaveBeenCalledOnce();
  });
});
