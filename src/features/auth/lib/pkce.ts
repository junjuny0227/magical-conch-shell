import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import 'server-only';

export interface PkceType {
  state: string;
  verifier: string;
  transactionId: string;
  challenge: string;
}
export const pkceChallenge = (verifier: string): string =>
  createHash('sha256').update(verifier).digest('base64url');
export const createPkce = (): PkceType => {
  const verifier = randomBytes(32).toString('base64url');
  return {
    verifier,
    state: randomBytes(32).toString('base64url'),
    transactionId: randomBytes(32).toString('base64url'),
    challenge: pkceChallenge(verifier),
  };
};
export const secureStateEqual = (expected: string, actual: string): boolean => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(expected) || !/^[A-Za-z0-9_-]{43}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
};
