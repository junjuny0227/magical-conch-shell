import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { createHash, randomBytes } from 'node:crypto';

import {
  accountFromUserInfo,
  createSession,
  destroySession,
  requireSession,
} from '@/entities/account/index.server';
import {
  AppError,
  assertOrigin,
  errorResponse,
  getAuthConfig,
  keyPrefix,
  serviceUnavailable,
  withRedis,
} from '@/shared/lib/server';

import 'server-only';
import { createPkce, secureStateEqual } from '../lib/pkce';

const TRANSACTION_COOKIE = 'conch_oauth_transaction';
const BROWSER_COOKIE = 'conch_oauth_browser';
const digest = (id: string) => createHash('sha256').update(id).digest('hex');
const validId = (id: string | undefined): id is string => !!id && /^[A-Za-z0-9_-]{43}$/.test(id);
const transactionKey = (id: string) => `${keyPrefix()}:oauth:transaction:${digest(id)}`;
const cookieOptions = (origin: string) => ({
  httpOnly: true,
  secure: origin.startsWith('https:'),
  sameSite: 'lax' as const,
  path: '/',
});
const rateScript = `
local browser = tonumber(redis.call('GET', KEYS[1]) or '0')
local shared = tonumber(redis.call('GET', KEYS[2]) or '0')
if browser >= 5 or shared >= 60 then return 0 end
for i=1,2 do
  local n = redis.call('INCR', KEYS[i])
  if n == 1 then redis.call('EXPIRE', KEYS[i], 60) end
end
return 1
`;
export const startLogin = async (request: Request): Promise<NextResponse> => {
  try {
    const config = getAuthConfig();
    if (new URL(request.url).origin !== config.appOrigin)
      throw new AppError(403, 'ACCESS_DENIED', '허용되지 않은 요청입니다.');
    const store = await cookies();
    const previousBrowser = store.get(BROWSER_COOKIE)?.value;
    const browser = validId(previousBrowser)
      ? previousBrowser
      : randomBytes(32).toString('base64url');
    const accepted = await withRedis((redis) =>
      redis.eval<[], number>(
        rateScript,
        [
          `${keyPrefix()}:oauth:rate:browser:${digest(browser)}`,
          `${keyPrefix()}:oauth:rate:shared`,
        ],
        [],
      ),
    );
    if (accepted !== 1)
      throw new AppError(
        429,
        'RATE_LIMITED',
        '로그인 요청이 많습니다. 잠시 후 다시 시도하세요.',
        60,
      );
    const pkce = createPkce();
    const previous = store.get(TRANSACTION_COOKIE)?.value;
    if (validId(previous)) await withRedis((redis) => redis.del(transactionKey(previous)));
    await withRedis((redis) =>
      redis.set(
        transactionKey(pkce.transactionId),
        { state: pkce.state, verifier: pkce.verifier, expiresAt: Date.now() + 300000 },
        { ex: 300 },
      ),
    );
    store.set(BROWSER_COOKIE, browser, { ...cookieOptions(config.appOrigin), maxAge: 86400 });
    store.set(TRANSACTION_COOKIE, pkce.transactionId, {
      ...cookieOptions(config.appOrigin),
      maxAge: 300,
    });
    const url = new URL('https://oauth.authorization.datagsm.kr/v1/oauth/authorize');
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      state: pkce.state,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
    }).toString();
    const response = NextResponse.redirect(url, 302);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return errorResponse(error);
  }
};

interface TransactionType {
  state: string;
  verifier: string;
  expiresAt: number;
}
const isTransaction = (value: unknown): value is TransactionType => {
  if (typeof value !== 'object' || value === null) return false;
  const transaction = value as Partial<TransactionType>;
  return (
    validId(transaction.state) &&
    validId(transaction.verifier) &&
    typeof transaction.expiresAt === 'number' &&
    Number.isSafeInteger(transaction.expiresAt) &&
    transaction.expiresAt > Date.now() &&
    transaction.expiresAt <= Date.now() + 300000
  );
};
const authRequired = () => new AppError(401, 'AUTH_REQUIRED', '로그인을 다시 시작하세요.');
const providerJson = async (url: string, init: RequestInit): Promise<unknown> => {
  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      if (response.status === 401 && init.method === 'POST') throw serviceUnavailable();
      if (response.status === 403)
        throw Object.assign(new AppError(403, 'ACCESS_DENIED', '이용할 수 없는 계정입니다.'), {
          cause: init.method === 'POST' ? 'TOKEN_FORBIDDEN' : 'USERINFO_FORBIDDEN',
        });
      if (response.status === 400 || response.status === 401) throw authRequired();
      throw new AppError(502, 'UPSTREAM_ERROR', '인증 서비스 응답을 처리하지 못했습니다.');
    }
    const text = await response.text();
    if (text.length > 65536) throw new Error('oversized');
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
      throw new AppError(504, 'UPSTREAM_TIMEOUT', '인증 서비스 응답이 지연되고 있습니다.');
    throw new AppError(502, 'UPSTREAM_ERROR', '인증 서비스 응답을 처리하지 못했습니다.');
  }
};
const accessTokenFrom = (value: unknown): string => {
  if (typeof value === 'object' && value !== null) {
    const token = value as Record<string, unknown>;
    if (
      typeof token.access_token === 'string' &&
      token.access_token.length > 0 &&
      token.access_token.length <= 16384 &&
      !/[\s\u0000-\u001f\u007f]/.test(token.access_token) &&
      token.token_type === 'Bearer' &&
      typeof token.expires_in === 'number' &&
      Number.isSafeInteger(token.expires_in) &&
      token.expires_in > 0
    )
      return token.access_token;
  }
  throw new AppError(502, 'UPSTREAM_ERROR', '인증 서비스 응답을 처리하지 못했습니다.');
};
const appRedirect = (origin: string, path: string): NextResponse => {
  const response = NextResponse.redirect(new URL(path, origin), 302);
  response.headers.set('Cache-Control', 'no-store');
  return response;
};
export const finishLogin = async (request: Request): Promise<NextResponse> => {
  try {
    const config = getAuthConfig();
    const store = await cookies();
    try {
      const url = new URL(request.url);
      if (url.origin !== config.appOrigin || url.pathname !== '/api/auth/callback')
        throw Object.assign(new AppError(403, 'ACCESS_DENIED', '허용되지 않은 요청입니다.'), {
          cause: 'CALLBACK_ORIGIN_MISMATCH',
        });
      const id = store.get(TRANSACTION_COOKIE)?.value;
      if (!validId(id)) throw authRequired();
      // 검증 실패도 거래를 소비하므로 같은 거래를 재사용할 수 없다.
      const transaction = await withRedis((redis) => redis.getdel<unknown>(transactionKey(id)));
      const states = url.searchParams.getAll('state');
      const codes = url.searchParams.getAll('code');
      if (
        !isTransaction(transaction) ||
        states.length !== 1 ||
        codes.length !== 1 ||
        !secureStateEqual(transaction.state, states[0]) ||
        !codes[0] ||
        codes[0].length > 4096 ||
        /[\s\u0000-\u001f\u007f]/.test(codes[0]) ||
        url.searchParams.has('error')
      )
        throw authRequired();
      const token = accessTokenFrom(
        await providerJson('https://oauth.authorization.datagsm.kr/v1/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code: codes[0],
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            code_verifier: transaction.verifier,
          }),
        }),
      );
      const profile = await providerJson('https://oauth.resource.datagsm.kr/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      await createSession(accountFromUserInfo(profile));
      return appRedirect(config.appOrigin, '/');
    } catch (error) {
      const allowedCodes = [
        'AUTH_REQUIRED',
        'ACCESS_DENIED',
        'SERVICE_UNAVAILABLE',
        'UPSTREAM_ERROR',
        'UPSTREAM_TIMEOUT',
      ];
      const code =
        error instanceof AppError && allowedCodes.includes(error.code)
          ? error.code
          : 'INTERNAL_ERROR';
      const params = new URLSearchParams({ error: code });
      // 개발 진단에는 원문 응답/개인정보가 아닌 고정된 실패 지점만 포함한다.
      const diagnosticReasons = [
        'CALLBACK_ORIGIN_MISMATCH',
        'TOKEN_FORBIDDEN',
        'USERINFO_FORBIDDEN',
        'ACCOUNT_FORMAT_INVALID',
        'ACCOUNT_STATUS_INVALID',
        'ACCOUNT_ID_INVALID',
        'ACCOUNT_TYPE_INVALID',
        'ACCOUNT_DETAILS_MISSING',
        'ACCOUNT_NAME_INVALID',
        'STUDENT_ENROLLMENT_INVALID',
        'STUDENT_ROLE_INVALID',
      ];
      if (
        process.env.NODE_ENV === 'development' &&
        error instanceof AppError &&
        code === 'ACCESS_DENIED' &&
        typeof error.cause === 'string' &&
        diagnosticReasons.includes(error.cause)
      )
        params.set('reason', error.cause);
      return appRedirect(config.appOrigin, `/login?${params}`);
    } finally {
      store.set(TRANSACTION_COOKIE, '', { ...cookieOptions(config.appOrigin), maxAge: 0 });
    }
  } catch (error) {
    return errorResponse(error);
  }
};
export const readSession = async (): Promise<NextResponse> => {
  try {
    return NextResponse.json(
      { data: await requireSession() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
};
export const logoutAccount = async (request: Request): Promise<NextResponse> => {
  try {
    assertOrigin(request);
    await destroySession();
    return NextResponse.json(
      { data: { success: true } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
};
