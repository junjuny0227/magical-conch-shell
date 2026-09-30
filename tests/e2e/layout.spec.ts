import { expect, test } from '@playwright/test';

// 로그인/Jeb 응답은 상태 UI만 검증하는 명시적 fixture다.
for (const width of [1440, 768, 375]) {
  test(`실제 렌더·한글 레이아웃 ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/auth/session', (route) =>
      route.fulfill({
        status: 401,
        json: { error: { code: 'AUTH_REQUIRED', message: '로그인이 필요해요.' } },
      }),
    );
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'DataGSM으로 로그인' })).toBeVisible();
    await expect(page.getByTestId('conch-stage')).toBeVisible();
    await expect(page.getByTestId('conch-stage')).toHaveAttribute(
      'data-scene-state',
      /ready|failed/,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: process.env.CONCH_CAPTURE_DIR
        ? `${process.env.CONCH_CAPTURE_DIR}/conch-home-${width}.png`
        : testInfo.outputPath(`conch-home-${width}.png`),
      fullPage: true,
    });
    await page.goto('/login?error=ACCESS_DENIED');
    await expect(page.getByTestId('conch-stage')).toHaveAttribute(
      'data-scene-state',
      /ready|failed/,
    );
    await expect(
      page.getByRole('alert').filter({ hasText: '재학생과 승인 완료 선생님만' }),
    ).toContainText('재학생과 승인 완료 선생님만 이용할 수 있어요.');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: process.env.CONCH_CAPTURE_DIR
        ? `${process.env.CONCH_CAPTURE_DIR}/conch-login-${width}.png`
        : testInfo.outputPath(`conch-login-${width}.png`),
      fullPage: true,
    });
  });
}
