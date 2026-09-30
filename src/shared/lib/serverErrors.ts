import { NextResponse } from 'next/server';

import 'server-only';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
export const serviceUnavailable = () =>
  new AppError(
    503,
    'SERVICE_UNAVAILABLE',
    '일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하세요.',
  );
export const errorResponse = (error: unknown): NextResponse => {
  const safe =
    error instanceof AppError
      ? error
      : new AppError(500, 'INTERNAL_ERROR', '요청을 처리하지 못했습니다.');
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (safe.retryAfterSeconds !== undefined) headers['Retry-After'] = String(safe.retryAfterSeconds);
  return NextResponse.json(
    {
      error: {
        code: safe.code,
        message: safe.message,
        ...(safe.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: safe.retryAfterSeconds }
          : {}),
      },
    },
    { status: safe.status, headers },
  );
};
