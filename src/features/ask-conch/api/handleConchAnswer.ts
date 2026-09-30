import { NextResponse } from 'next/server';

import { randomUUID } from 'node:crypto';

import { requireSession } from '@/entities/account/index.server';
import { CONCH_ANSWERS, type ConchAnswerIdType } from '@/entities/conch';
import { AppError, assertOrigin, errorResponse, getRedis, keyPrefix } from '@/shared/lib/server';

import 'server-only';
import { type ConchAnswerType, validateQuestion } from '../model/question';
import { isHighStakesQuestion } from '../model/safety';
import { JebError, requestJebAnswer } from './jeb';
import { completeReservation, reserveRequest } from './reservation';

interface HandlerOptionsType {
  key?: string;
  fetcher?: typeof fetch;
}

const readBody = async (request: Request): Promise<unknown> => {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'INVALID_QUESTION', '질문을 입력해 주세요.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new AppError(413, 'BODY_TOO_LARGE', '요청 크기가 너무 큽니다.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new AppError(400, 'INVALID_QUESTION', '올바른 JSON 질문을 보내 주세요.');
  }
};

/** 인증과 검증이 끝나기 전에는 예산을 예약하거나 Jeb을 호출하지 않는다. */
export const handleConchAnswer = async (
  request: Request,
  options: HandlerOptionsType = {},
): Promise<NextResponse> => {
  try {
    assertOrigin(request);
    const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json')
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'JSON 형식으로 요청해 주세요.');
    const session = await requireSession();
    const body = await readBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new AppError(400, 'INVALID_QUESTION', '올바른 질문을 보내 주세요.');
    const { question: rawQuestion, requestId } = body as Record<string, unknown>;
    let question: string;
    try {
      question = validateQuestion(rawQuestion);
    } catch {
      throw new AppError(400, 'INVALID_QUESTION', '질문은 1~300자로 입력해 주세요.');
    }
    if (
      typeof requestId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
    )
      throw new AppError(400, 'INVALID_REQUEST_ID', '올바른 요청 식별자가 필요합니다.');
    if (isHighStakesQuestion(question))
      throw new AppError(
        400,
        'UNSUPPORTED_QUESTION',
        '건강·안전 등 중요한 결정에는 소라고동의 답을 사용할 수 없어요. 믿을 수 있는 사람이나 전문가와 상의해 주세요.',
      );
    const key = options.key ?? process.env.JEB_API_KEY;
    if (!key)
      throw new AppError(503, 'SERVICE_UNAVAILABLE', '답변 서비스를 잠시 이용할 수 없습니다.');
    const redis = getRedis();
    const input = {
      prefix: keyPrefix(),
      userId: session.user.id,
      requestId,
      question,
      owner: randomUUID(),
    };
    const reservation = await reserveRequest(redis, input);
    let answer: ConchAnswerType;
    if (reservation.kind === 'cached') answer = reservation.answer;
    else {
      try {
        const answerId = await requestJebAnswer(question, key, options.fetcher);
        answer = { requestId, answerId, answerText: CONCH_ANSWERS[answerId as ConchAnswerIdType] };
      } catch (error) {
        const appError =
          error instanceof AppError
            ? error
            : new AppError(502, 'UPSTREAM_ERROR', '답변 서비스에 문제가 발생했습니다.');
        await completeReservation(
          redis,
          input,
          error instanceof JebError && error.uncertain ? 'uncertain' : 'failed',
          {
            status: appError.status,
            code: appError.code,
            message: appError.message,
            retryAfterSeconds: appError.retryAfterSeconds,
          },
        );
        throw appError;
      }
      await completeReservation(redis, input, 'success', answer);
    }
    return NextResponse.json({ data: answer }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
};
