import { NextResponse } from 'next/server';

import { requireSession } from '@/entities/account/index.server';
import { errorResponse, getRedis, keyPrefix } from '@/shared/lib/server';

import 'server-only';
import { getConchUsage } from './reservation';

/** 사용자 식별자는 요청 URL이 아니라 검증된 서버 세션에서만 얻는다. */
export const handleConchUsage = async (_request: Request): Promise<NextResponse> => {
  void _request;
  try {
    const session = await requireSession();
    const usage = await getConchUsage(getRedis(), keyPrefix(), session.user.id);
    return NextResponse.json({ data: usage }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
};
