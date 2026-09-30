import { execFile, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import { COMPLETE_SCRIPT, RESERVE_SCRIPT } from './reservation';

// 설치나 원격 접속 없이 localhost Redis가 있을 때만 실제 production Lua를 실행한다.
const port = process.env.CONCH_TEST_REDIS_PORT ?? '6379';
const probe = spawnSync('redis-cli', ['-h', '127.0.0.1', '-p', port, 'PING'], {
  timeout: 1000,
  encoding: 'utf8',
});
const available = probe.status === 0 && probe.stdout.trim() === 'PONG';
const exec = promisify(execFile);
const command = async (...args: string[]): Promise<unknown> => {
  const { stdout } = await exec('redis-cli', ['-h', '127.0.0.1', '-p', port, '--json', ...args]);
  return JSON.parse(stdout);
};
const touched = new Set<string>();
const makeKeys = (root: string, user = 'user1', id = 'id1') => {
  const keys = [
    `${root}:request:${user}:${id}`,
    `${root}:user:${user}`,
    `${root}:global`,
    `${root}:slots`,
  ];
  keys.forEach((key) => touched.add(key));
  return keys;
};
const reserve = (keys: string[], owner: string = randomUUID(), hash = 'question-hash') =>
  command('EVAL', RESERVE_SCRIPT, '4', ...keys, hash, owner);
const finish = (keys: string[], owner: string, state: string) =>
  command('EVAL', COMPLETE_SCRIPT, '2', keys[0], keys[3], owner, state, '{}');
const counters = async (keys: string[]) => {
  const [seconds] = (await command('TIME')) as string[];
  const day = Math.floor((Number(seconds) + 32400) / 86400);
  const userDaily = `${keys[1]}:day:${day}`;
  const globalDaily = `${keys[2]}:day:${day}`;
  const cooldown = `${keys[1]}:cooldown`;
  [userDaily, globalDaily, cooldown].forEach((key) => touched.add(key));
  return { userDaily, globalDaily, cooldown };
};

describe.skipIf(!available)('localhost 실제 Redis production Lua 경쟁 증명', () => {
  afterEach(async () => {
    if (touched.size) await command('DEL', ...touched);
    touched.clear();
  });
  it('동일 요청 20개의 동시 예약은 하나만 upstream 슬롯을 얻는다', async () => {
    const keys = makeKeys(`conch-test:${randomUUID()}`);
    await counters(keys);
    const results = await Promise.all(Array.from({ length: 20 }, () => reserve(keys)));
    expect(results.filter((value) => (value as string[])[0] === 'reserved')).toHaveLength(1);
    expect(results.filter((value) => (value as string[])[0] === 'pending')).toHaveLength(19);
    expect(await command('ZCARD', keys[3])).toBe(1);
    expect(await command('TTL', keys[0])).toBeGreaterThanOrEqual(299);
  });
  it('동시 슬롯 5개와 60초 lease를 지킨다', async () => {
    const root = `conch-test:${randomUUID()}`;
    const keys = Array.from({ length: 12 }, (_, index) => makeKeys(root, `user${index}`));
    for (const key of keys) await counters(key);
    const results = await Promise.all(keys.map((key) => reserve(key)));
    expect(results.filter((value) => (value as string[])[0] === 'reserved')).toHaveLength(5);
    expect(await command('ZCARD', keys[0][3])).toBe(5);
    const [seconds] = (await command('TIME')) as string[];
    const scores = (await command('ZRANGE', keys[0][3], '0', '-1', 'WITHSCORES')) as string[];
    expect(Number(scores[1]) - Number(seconds) * 1000).toBeGreaterThan(58000);
  });
  it('10초 cooldown, 사용자 30회, 공용 9500회 제한은 예약 전에 검사한다', async () => {
    const root = `conch-test:${randomUUID()}`;
    const keys = makeKeys(root);
    const limits = await counters(keys);
    expect(await reserve(keys, 'owner1')).toEqual(['reserved']);
    expect(((await reserve(makeKeys(root, 'user1', 'id2'))) as string[])[0]).toBe('limited');
    await command('DEL', limits.cooldown);
    await command('SET', limits.userDaily, '30');
    expect(((await reserve(makeKeys(root, 'user1', 'id3'))) as string[])[0]).toBe('limited');
    await command('SET', limits.userDaily, '0');
    await command('SET', limits.globalDaily, '9500');
    expect(((await reserve(makeKeys(root, 'user1', 'id4'))) as string[])[0]).toBe('limited');
    expect(await command('ZCARD', keys[3])).toBe(1);
  });
  it('다른 소유자는 기록이나 슬롯을 제거할 수 없고 모호한 결과는 lease를 유지한다', async () => {
    const keys = makeKeys(`conch-test:${randomUUID()}`);
    await counters(keys);
    await reserve(keys, 'owner1');
    expect(await finish(keys, 'owner2', 'success')).toBe(0);
    expect(await command('HGET', keys[0], 'state')).toBe('pending');
    expect(await finish(keys, 'owner1', 'uncertain')).toBe(1);
    expect(await command('ZCARD', keys[3])).toBe(1);
    expect(await reserve(keys)).toEqual(['uncertain', '{}']);
    expect(await reserve(keys, 'owner3', 'changed-hash')).toEqual(['mismatch']);
  });
});
