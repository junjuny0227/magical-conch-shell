import { expect, test } from '@playwright/test';

test('분석 SDK를 한 번 연결하고 민감한 URL을 전송 전에 정리한다', async ({ page }) => {
  // SDK 연결과 beforeSend 등록만 검사하며 외부 분석 서버에는 요청하지 않는다.
  await page.route('https://va.vercel-scripts.com/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.goto('/login?error=ACCESS_DENIED&reason=private-reason');

  await expect(
    page.locator('script[src="https://va.vercel-scripts.com/v1/script.debug.js"]'),
  ).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => window.vaq?.some(([name]) => name === 'beforeSend') ?? false))
    .toBe(true);

  const filtered = await page.evaluate(() => {
    const registered = window.vaq?.find(([name]) => name === 'beforeSend')?.[1];
    const filter = registered as (event: {
      type: 'pageview';
      url: string;
    }) => { type: string; url: string } | null;
    return {
      login: filter({ type: 'pageview', url: window.location.href }),
      callback: filter({
        type: 'pageview',
        url: `${window.location.origin}/api/auth/callback?code=private-code&state=private-state`,
      }),
    };
  });
  expect(filtered.login).toEqual({ type: 'pageview', url: 'http://localhost:3100/login' });
  expect(filtered.callback).toBeNull();
});
