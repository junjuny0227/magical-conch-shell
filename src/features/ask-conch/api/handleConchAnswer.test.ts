import { beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({ session: vi.fn(), redis: { eval: vi.fn() }, origin: vi.fn() }));
vi.mock('@/entities/account/index.server', () => ({ requireSession: deps.session }));
vi.mock('@/shared/lib/server', async () => {
  const { NextResponse } = await import('next/server');
  class AppError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
      public retryAfterSeconds?: number,
    ) {
      super(message);
    }
  }
  return {
    AppError,
    assertOrigin: deps.origin,
    getRedis: () => deps.redis,
    keyPrefix: () => 'test',
    errorResponse: (error: AppError) =>
      NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status || 500 },
      ),
  };
});
import { jebFixture } from '../model/jebFixture';
import { handleConchAnswer } from './handleConchAnswer';

const requestId = '84552904-4022-49b8-a357-6b8b47e3bd1f';
const req = (body: unknown, headers = { 'Content-Type': 'application/json' }) =>
  new Request('http://localhost/api/conch/answer', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  deps.session.mockResolvedValue({
    user: { id: 'user1', name: '절대 보내면 안 되는 이름', objectType: 'STUDENT' },
    expiresAt: Date.now() + 60000,
  });
  deps.redis.eval.mockResolvedValue(['reserved']);
});

describe('인증된 소라고동 요청 경계', () => {
  it.each([
    '죽고 싶어. 자해할까?',
    '약을 두 배로 먹을까요?',
    '친구를 때릴까?',
    '주식에 전재산을 투자할까?',
  ])('명시적인 고위험 질문은 답변을 선택하지 않는다: %s', async (question) => {
    const fetcher = vi.fn();
    const response = await handleConchAnswer(req({ question, requestId }), {
      key: 'fixture',
      fetcher,
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('UNSUPPORTED_QUESTION');
    expect(fetcher).not.toHaveBeenCalled();
    expect(deps.redis.eval).not.toHaveBeenCalled();
  });
  it('세션 실패 시 upstream과 Redis 예약을 실행하지 않는다', async () => {
    deps.session.mockRejectedValue({ status: 401, code: 'AUTH_REQUIRED', message: '로그인 필요' });
    const fetcher = vi.fn();
    const response = await handleConchAnswer(req({ question: '질문', requestId }), {
      key: 'fixture',
      fetcher,
    });
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
    expect(deps.redis.eval).not.toHaveBeenCalled();
  });
  it.each([
    { question: ' ', requestId },
    { question: '가'.repeat(301), requestId },
    { question: '질문', requestId: 'not-uuid' },
  ])('입력을 예약 전에 거부한다', async (body) => {
    expect((await handleConchAnswer(req(body), { key: 'fixture' })).status).toBe(400);
    expect(deps.redis.eval).not.toHaveBeenCalled();
  });
  it('실제 스트림 크기가 8KB를 넘으면 content-length 없이 거부한다', async () => {
    expect(
      (await handleConchAnswer(req({ question: '가'.repeat(8192), requestId }), { key: 'fixture' }))
        .status,
    ).toBe(413);
    expect(deps.redis.eval).not.toHaveBeenCalled();
  });
  it('JSON 이외의 content-type을 거부한다', async () => {
    expect(
      (await handleConchAnswer(req({}, { 'Content-Type': 'text/plain' }), { key: 'fixture' }))
        .status,
    ).toBe(415);
  });
  it('성공 응답은 고정 대사와 완료 기록을 생성하고 개인정보를 보내지 않는다', async () => {
    deps.redis.eval.mockResolvedValueOnce(['reserved']).mockResolvedValueOnce(1);
    const fetcher = vi.fn().mockResolvedValue(Response.json(jebFixture));
    const response = await handleConchAnswer(req({ question: ' 질문 ', requestId }), {
      key: 'fixture',
      fetcher,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { requestId, answerId: '2', answerText: '아니.' },
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).state).toEqual({ question: '질문' });
    expect(fetcher.mock.calls[0][1].body).not.toContain('절대 보내면 안 되는 이름');
    expect(deps.redis.eval.mock.calls[1][2][1]).toBe('success');
  });
  it('연결이 끊긴 요청은 모호한 기록으로 완료하고 비밀 원문을 숨긴다', async () => {
    deps.redis.eval.mockResolvedValueOnce(['reserved']).mockResolvedValueOnce(1);
    const response = await handleConchAnswer(req({ question: '질문', requestId }), {
      key: 'fixture',
      fetcher: vi.fn().mockRejectedValue(new TypeError('secret upstream body')),
    });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret');
    expect(deps.redis.eval.mock.calls[1][2][1]).toBe('uncertain');
  });
  it('Origin이 거부되면 세션이나 예약을 조회하지 않는다', async () => {
    deps.origin.mockImplementationOnce(() => {
      throw { status: 403, code: 'ACCESS_DENIED', message: '허용되지 않은 요청' };
    });
    expect(
      (await handleConchAnswer(req({ question: '질문', requestId }), { key: 'fixture' })).status,
    ).toBe(403);
    expect(deps.session).not.toHaveBeenCalled();
    expect(deps.redis.eval).not.toHaveBeenCalled();
  });
  it('완료 저장소 실패 시 성공으로 보고하지 않는다', async () => {
    deps.redis.eval
      .mockResolvedValueOnce(['reserved'])
      .mockRejectedValueOnce(new Error('Redis secret'));
    const response = await handleConchAnswer(req({ question: '질문', requestId }), {
      key: 'fixture',
      fetcher: vi.fn().mockResolvedValue(Response.json(jebFixture)),
    });
    expect(response.status).toBe(503);
  });
  it('성공 캐시는 세션 검증 뒤 반환하고 upstream을 재호출하지 않는다', async () => {
    const answer = { requestId, answerId: '2', answerText: '아니.' };
    deps.redis.eval.mockResolvedValue(['success', JSON.stringify(answer)]);
    const fetcher = vi.fn();
    const response = await handleConchAnswer(req({ question: '질문', requestId }), {
      key: 'fixture',
      fetcher,
    });
    expect(await response.json()).toEqual({ data: answer });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(deps.session).toHaveBeenCalledOnce();
    expect(deps.origin).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
