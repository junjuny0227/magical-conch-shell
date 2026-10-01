import { expect, test } from '@playwright/test';

// 로그인/Jeb 응답은 상태 UI만 검증하는 명시적 fixture다.
for (const [width, height] of [
  [1440, 900],
  [768, 900],
  [375, 812],
  [375, 667],
  [1440, 600],
]) {
  test(`중앙 세로 레이아웃과 고정 화면 ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.route('**/api/auth/session', (route) =>
      route.fulfill({
        json: {
          data: {
            user: { id: 'fixture-student', name: '테스트 학생', objectType: 'STUDENT' },
            expiresAt: 1900000000000,
          },
        },
      }),
    );
    await page.goto('/');
    await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('contentinfo')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '소라고동에게 묻기' })).toHaveCount(0);
    await expect(
      page.getByText('질문을 입력하고 고리를 당겨 주세요.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveAttribute('aria-describedby', 'question-hint');
    await expect(page.getByTestId('conch-stage')).toBeVisible();
    await expect(page.getByTestId('conch-stage')).toHaveAttribute(
      'data-scene-state',
      /ready|failed/,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const layout = await page.evaluate(() => {
      const model = document.querySelector('[data-testid="conch-stage"]')!.getBoundingClientRect();
      const input = document.querySelector('textarea')!.getBoundingClientRect();
      const result = document
        .querySelector('[data-testid="conch-result"]')!
        .getBoundingClientRect();
      const app = document.querySelector('.conch-app')!.getBoundingClientRect();
      return {
        modelBottom: model.bottom,
        inputTop: input.top,
        resultTop: result.top,
        resultBottom: result.bottom,
        modelCenter: model.left + model.width / 2,
        inputCenter: input.left + input.width / 2,
        appHeight: app.height,
        documentHeight: document.documentElement.scrollHeight,
      };
    });
    expect(layout.appHeight).toBe(height);
    expect(layout.documentHeight).toBe(height);
    expect(layout.inputTop).toBeGreaterThanOrEqual(layout.modelBottom);
    expect(layout.resultTop).toBeGreaterThanOrEqual(layout.modelBottom);
    expect(layout.resultBottom).toBeLessThanOrEqual(layout.inputTop);
    expect(Math.abs(layout.modelCenter - layout.inputCenter)).toBeLessThan(2);
    await expect(page.getByTestId('conch-result')).toBeEmpty();
    await page.screenshot({
      path: process.env.CONCH_CAPTURE_DIR
        ? `${process.env.CONCH_CAPTURE_DIR}/conch-home-${width}-${height}.png`
        : testInfo.outputPath(`conch-home-${width}-${height}.png`),
      fullPage: true,
    });
    await page.goto('/login?error=ACCESS_DENIED');
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByText('로그인은 1시간 동안 유지돼요.', { exact: false })).toHaveCount(0);
    await expect(page.getByText('DataGSM 비밀번호는 이 앱에서', { exact: false })).toHaveCount(0);
    await expect(page.locator('.conch-app')).toHaveCSS('height', `${height}px`);
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
        ? `${process.env.CONCH_CAPTURE_DIR}/conch-login-${width}-${height}.png`
        : testInfo.outputPath(`conch-login-${width}-${height}.png`),
      fullPage: true,
    });
  });
}
