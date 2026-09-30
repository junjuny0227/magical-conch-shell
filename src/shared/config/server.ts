import { serviceUnavailable } from '@/shared/lib/serverErrors';

import 'server-only';

export interface AuthConfigType {
  appOrigin: string;
  clientId: string;
  redirectUri: string;
}
const parseUrl = (value: string | undefined): URL => {
  try {
    if (!value || value !== value.trim()) throw new Error();
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    )
      throw new Error();
    return url;
  } catch {
    throw serviceUnavailable();
  }
};
export const getAppOrigin = (): string => {
  const url = parseUrl(process.env.APP_ORIGIN);
  if (url.pathname !== '/' || url.search || url.hash) throw serviceUnavailable();
  return url.origin;
};
export const getAuthConfig = (): AuthConfigType => {
  const appOrigin = getAppOrigin();
  const clientId = process.env.DATAGSM_CLIENT_ID;
  if (!clientId || !clientId.trim() || clientId !== clientId.trim() || clientId.length > 512)
    throw serviceUnavailable();
  const redirect = parseUrl(process.env.DATAGSM_REDIRECT_URI);
  if (
    redirect.origin !== appOrigin ||
    redirect.pathname !== '/api/auth/callback' ||
    redirect.search ||
    redirect.hash
  )
    throw serviceUnavailable();
  return { appOrigin, clientId, redirectUri: redirect.href };
};
