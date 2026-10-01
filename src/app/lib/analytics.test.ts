import { describe, expect, it } from 'vitest';

import { sanitizeAnalyticsEvent } from './analytics';

describe('분석 이벤트 개인정보 경계', () => {
  it.each(['/', '/login'])('공개 화면 %s의 경로만 남긴다', (path) => {
    expect(
      sanitizeAnalyticsEvent({
        type: 'pageview',
        url: `https://conch.example${path}?code=private-code&state=private-state#private-fragment`,
      }),
    ).toEqual({ type: 'pageview', url: `https://conch.example${path}` });
  });
  it.each(['/api/auth/callback', '/api/auth/login', '/api/conch/answer', '/unknown'])(
    '%s는 수집하지 않는다',
    (path) => {
      expect(
        sanitizeAnalyticsEvent({ type: 'pageview', url: `https://conch.example${path}` }),
      ).toBeNull();
    },
  );
  it('개발 진단 reason과 임의의 query를 제거한다', () => {
    expect(
      sanitizeAnalyticsEvent({
        type: 'pageview',
        url: 'https://conch.example/login?error=ACCESS_DENIED&reason=STUDENT_ROLE_INVALID&question=private',
      }),
    ).toEqual({ type: 'pageview', url: 'https://conch.example/login' });
  });
  it('사용자 정보가 담길 수 있는 custom event는 수집하지 않는다', () => {
    expect(sanitizeAnalyticsEvent({ type: 'event', url: 'https://conch.example/' })).toBeNull();
  });
  it('손상된 URL을 수집하지 않는다', () => {
    expect(sanitizeAnalyticsEvent({ type: 'pageview', url: 'not-a-url' })).toBeNull();
  });
});
