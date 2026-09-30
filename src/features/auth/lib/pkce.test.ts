import { describe, expect, it } from 'vitest';

import { createPkce, pkceChallenge, secureStateEqual } from './pkce';

describe('실제 PKCE 암호화', () => {
  it('RFC7636 S256 벡터와 일치한다', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
  it('독립적인 256bit state/verifier/거래 ID를 생성한다', () => {
    const first = createPkce();
    const second = createPkce();
    for (const value of [first.state, first.verifier, first.transactionId])
      expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      new Set([
        first.state,
        first.verifier,
        first.transactionId,
        second.state,
        second.verifier,
        second.transactionId,
      ]).size,
    ).toBe(6);
    expect(first.challenge).toBe(pkceChallenge(first.verifier));
  });
  it('상태 누락·길이·내용 불일치를 거부한다', () => {
    expect(secureStateEqual('a'.repeat(43), 'a'.repeat(43))).toBe(true);
    expect(secureStateEqual('a'.repeat(43), 'b'.repeat(43))).toBe(false);
    expect(secureStateEqual('a'.repeat(43), '')).toBe(false);
    expect(secureStateEqual('a'.repeat(43), '한'.repeat(43))).toBe(false);
  });
});
