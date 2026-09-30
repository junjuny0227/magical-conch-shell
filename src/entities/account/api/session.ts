import { cookies } from 'next/headers';

import { createHash, randomBytes } from 'node:crypto';

import { AppError, getAppOrigin, keyPrefix, withRedis } from '@/shared/lib/server';

import 'server-only';
import { isAccount, parseSession } from '../model/account';
import type { AccountType, SessionType } from '../model/types';

export const SESSION_COOKIE = 'conch_session';
const sessionKey = (id: string) =>
  `${keyPrefix()}:session:${createHash('sha256').update(id).digest('hex')}`;
const validId = (id: string | undefined): id is string => !!id && /^[A-Za-z0-9_-]{43}$/.test(id);
const cookieOptions = () => ({
  httpOnly: true,
  secure: getAppOrigin().startsWith('https:'),
  sameSite: 'lax' as const,
  path: '/',
});
export const getSession = async (): Promise<SessionType | null> => {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!validId(id)) return null;
  const data = await withRedis((redis) => redis.get<unknown>(sessionKey(id)));
  return parseSession(data);
};
export const requireSession = async (): Promise<SessionType> => {
  const session = await getSession();
  if (!session) throw new AppError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
  return session;
};
export const createSession = async (account: AccountType): Promise<string> => {
  if (!isAccount(account)) throw new AppError(403, 'ACCESS_DENIED', '허용되지 않은 계정입니다.');
  const options = cookieOptions();
  const id = randomBytes(32).toString('base64url');
  const user: AccountType = { id: account.id, name: account.name, objectType: account.objectType };
  await withRedis((redis) =>
    redis.set(sessionKey(id), { user, expiresAt: Date.now() + 3600000 }, { ex: 3600 }),
  );
  (await cookies()).set(SESSION_COOKIE, id, { ...options, maxAge: 3600 });
  return id;
};
export const destroySession = async (): Promise<void> => {
  const options = cookieOptions();
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  if (validId(id)) await withRedis((redis) => redis.del(sessionKey(id)));
  store.set(SESSION_COOKIE, '', { ...options, maxAge: 0 });
};
