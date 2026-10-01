import type { BeforeSendEvent } from '@vercel/analytics/next';

// 화면 조회만 집계한다. OAuth code/state·진단 reason·질문 query는 전송하지 않는다.
export const sanitizeAnalyticsEvent = (event: BeforeSendEvent): BeforeSendEvent | null => {
  if (event.type !== 'pageview') return null;
  try {
    const url = new URL(event.url);
    if (url.pathname !== '/' && url.pathname !== '/login') return null;
    return { type: 'pageview', url: `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
};
