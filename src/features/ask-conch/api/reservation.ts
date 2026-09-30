import { createHash } from 'node:crypto';

import { CONCH_ANSWERS, type ConchAnswerIdType } from '@/entities/conch';
import { AppError } from '@/shared/lib/server';

import 'server-only';
import type { ConchAnswerType } from '../model/question';

export interface RedisBoundaryType {
  eval: (script: string, keys: string[], args: string[]) => Promise<unknown>;
}
export interface ReservationInputType {
  prefix: string;
  userId: string;
  requestId: string;
  question: string;
  owner: string;
}
interface StoredErrorType {
  status: number;
  code: string;
  message: string;
  retryAfterSeconds?: number;
}

/** Redis 서버 시계로 KST 날짜와 lease를 계산한다. 모든 검사와 예약은 한 번의 EVAL이다. */
export const RESERVE_SCRIPT = `
local record = KEYS[1]
if redis.call('EXISTS', record) == 1 then
  if redis.call('HGET', record, 'hash') ~= ARGV[1] then return {'mismatch'} end
  local state = redis.call('HGET', record, 'state')
  return {state, redis.call('HGET', record, 'payload') or ''}
end
local clock = redis.call('TIME')
local seconds = tonumber(clock[1])
local now = seconds * 1000 + math.floor(tonumber(clock[2]) / 1000)
local day = math.floor((seconds + 32400) / 86400)
local reset = (day + 1) * 86400 - 32400 - seconds
local userDaily = KEYS[2] .. ':day:' .. day
local cooldown = KEYS[2] .. ':cooldown'
local globalDaily = KEYS[3] .. ':day:' .. day
local remaining = redis.call('TTL', cooldown)
if remaining > 0 then return {'limited', tostring(remaining)} end
if tonumber(redis.call('GET', userDaily) or '0') >= 30 then return {'limited', tostring(reset)} end
if tonumber(redis.call('GET', globalDaily) or '0') >= 9500 then return {'limited', tostring(reset)} end
redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', now)
if redis.call('ZCARD', KEYS[4]) >= 5 then return {'limited', '60'} end
redis.call('INCR', userDaily)
redis.call('EXPIRE', userDaily, reset)
redis.call('INCR', globalDaily)
redis.call('EXPIRE', globalDaily, reset)
redis.call('SET', cooldown, '1', 'EX', 10)
redis.call('ZADD', KEYS[4], now + 60000, ARGV[2])
redis.call('EXPIRE', KEYS[4], 120)
redis.call('HSET', record, 'hash', ARGV[1], 'owner', ARGV[2], 'state', 'pending')
redis.call('EXPIRE', record, 300)
return {'reserved'}
`;

export const COMPLETE_SCRIPT = `
local state = ARGV[2]
if redis.call('HGET', KEYS[1], 'owner') ~= ARGV[1] then return 0 end
if redis.call('HGET', KEYS[1], 'state') ~= 'pending' then return 0 end
redis.call('HSET', KEYS[1], 'state', state, 'payload', ARGV[3])
redis.call('EXPIRE', KEYS[1], 300)
if state ~= 'uncertain' then redis.call('ZREM', KEYS[2], ARGV[1]) end
return 1
`;

const keysFor = (input: ReservationInputType) => {
  const root = `${input.prefix}:{conch}`;
  const userHash = createHash('sha256').update(input.userId).digest('hex');
  return [
    `${root}:request:${userHash}:${input.requestId}`,
    `${root}:user:${userHash}`,
    `${root}:global`,
    `${root}:slots`,
  ];
};
const unavailable = () => new AppError(503, 'SERVICE_UNAVAILABLE', '잠시 후 다시 시도해 주세요.');

export const reserveRequest = async (
  redis: RedisBoundaryType,
  input: ReservationInputType,
): Promise<{ kind: 'reserved' } | { kind: 'cached'; answer: ConchAnswerType }> => {
  let response: unknown;
  try {
    response = await redis.eval(RESERVE_SCRIPT, keysFor(input), [
      createHash('sha256').update(input.question).digest('hex'),
      input.owner,
    ]);
  } catch {
    throw unavailable();
  }
  if (!Array.isArray(response)) throw unavailable();
  const [state, payload] = response;
  if (state === 'reserved') return { kind: 'reserved' };
  if (state === 'success') {
    try {
      const answer: unknown = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (
        !answer ||
        typeof answer !== 'object' ||
        !('requestId' in answer) ||
        answer.requestId !== input.requestId ||
        !('answerId' in answer) ||
        typeof answer.answerId !== 'string' ||
        !Object.hasOwn(CONCH_ANSWERS, answer.answerId) ||
        !('answerText' in answer) ||
        answer.answerText !== CONCH_ANSWERS[answer.answerId as ConchAnswerIdType]
      )
        throw unavailable();
      return {
        kind: 'cached',
        answer: answer as ConchAnswerType,
      };
    } catch {
      throw unavailable();
    }
  }
  if (state === 'failed') {
    let stored: StoredErrorType;
    try {
      const parsed: unknown = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('status' in parsed) ||
        typeof parsed.status !== 'number' ||
        ![429, 502, 503, 504].includes(parsed.status) ||
        !('code' in parsed) ||
        typeof parsed.code !== 'string' ||
        ![
          'RATE_LIMITED',
          'UPSTREAM_ERROR',
          'UPSTREAM_INVALID_REQUEST',
          'UPSTREAM_TIMEOUT',
          'SERVICE_UNAVAILABLE',
        ].includes(parsed.code) ||
        !('message' in parsed) ||
        typeof parsed.message !== 'string' ||
        parsed.message.length > 300 ||
        ('retryAfterSeconds' in parsed &&
          parsed.retryAfterSeconds !== undefined &&
          (typeof parsed.retryAfterSeconds !== 'number' ||
            !Number.isSafeInteger(parsed.retryAfterSeconds) ||
            parsed.retryAfterSeconds < 1 ||
            parsed.retryAfterSeconds > 86400))
      )
        throw unavailable();
      stored = parsed as StoredErrorType;
    } catch {
      throw unavailable();
    }
    throw new AppError(stored.status, stored.code, stored.message, stored.retryAfterSeconds);
  }
  if (state === 'limited')
    throw new AppError(
      429,
      'RATE_LIMITED',
      '잠시 기다린 뒤 다시 질문해 주세요.',
      Math.max(1, Math.min(86400, Number(payload) || 60)),
    );
  if (['pending', 'mismatch', 'uncertain'].includes(String(state)))
    throw new AppError(
      409,
      'REQUEST_CONFLICT',
      '이미 처리 중이거나 사용한 요청입니다. 새 시도 여부를 확인해 주세요.',
    );
  throw unavailable();
};

export const completeReservation = async (
  redis: RedisBoundaryType,
  input: ReservationInputType,
  state: 'success' | 'failed' | 'uncertain',
  payload: ConchAnswerType | StoredErrorType,
): Promise<void> => {
  const keys = keysFor(input);
  try {
    const result = await redis.eval(
      COMPLETE_SCRIPT,
      [keys[0], keys[3]],
      [input.owner, state, JSON.stringify(payload)],
    );
    if (result !== 1) throw unavailable();
  } catch {
    throw unavailable();
  }
};
