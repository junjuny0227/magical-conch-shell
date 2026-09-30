import { afterEach, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ constructor: vi.fn(), get: vi.fn() }));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(config: unknown) {
      boundary.constructor(config);
    }
    get = boundary.get;
  },
}));

import { getRedis, withRedis } from './server';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it('Redis는 자동 재시도 없이 5초 timeout을 적용한다', () => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fixture-token');
  getRedis();
  expect(boundary.constructor).toHaveBeenCalledWith(
    expect.objectContaining({ retry: false, signal: expect.any(Function) }),
  );
  const config = boundary.constructor.mock.calls[0][0];
  expect(config.signal()).toBeInstanceOf(AbortSignal);
});
it('Redis 원문 장애는 안전한 503으로 분류한다', async () => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fixture-token');
  boundary.get.mockRejectedValue(new Error('private datastore detail'));
  await expect(withRedis((redis) => redis.get('fixture'))).rejects.toMatchObject({
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
  });
});
