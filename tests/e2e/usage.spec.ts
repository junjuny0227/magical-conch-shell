import { expect, test } from '@playwright/test';

const session = {
  user: { id: 'fixture-student', name: '테스트 학생', objectType: 'STUDENT' },
  expiresAt: 1900000000000,
};
const usage = (remaining: number, retryAfterSeconds = 0) => ({
  dailyLimit: 30,
  remaining,
  retryAfterSeconds,
  resetAfterSeconds: 3600,
});

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { data: session } }));
  await page.route('https://va.vercel-scripts.com/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.route('**/_vercel/insights/script.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
});

test('서버 횟수를 표시하고 질문 뒤 갱신하며 새로고침해도 유지한다', async ({ page }) => {
  let remaining = 27;
  await page.route('**/api/conch/usage', (route) =>
    route.fulfill({ json: { data: usage(remaining) } }),
  );
  await page.route('**/api/conch/answer', (route) => {
    remaining -= 1;
    const { requestId } = route.request().postDataJSON();
    return route.fulfill({ json: { data: { requestId, answerId: '1', answerText: '응.' } } });
  });
  await page.goto('/');
  await expect(page.getByTestId('conch-usage')).toHaveText('하루 최대 30회 · 오늘 남은 질문 27회');
  await page.getByLabel('소라고동에게 물어볼 질문').fill('산책할까요?');
  await expect(page.getByTestId('conch-stage')).toHaveAttribute('data-scene-state', 'ready');
  await page.getByRole('button', { name: '소라고동 고리 당기기' }).press('Space');
  await expect(page.getByTestId('conch-usage')).toHaveText('하루 최대 30회 · 오늘 남은 질문 26회');
  await page.reload();
  await expect(page.getByTestId('conch-usage')).toHaveText('하루 최대 30회 · 오늘 남은 질문 26회');
});

test('제한 안내는 남은 초가 줄어들고 질문 수정으로 우회할 수 없다', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/conch/usage', (route) => route.fulfill({ json: { data: usage(29) } }));
  let calls = 0;
  await page.route('**/api/conch/answer', (route) => {
    calls += 1;
    return route.fulfill({
      status: 429,
      json: {
        error: {
          code: 'RATE_LIMITED',
          message: '잠시 기다린 뒤 다시 질문해 주세요.',
          retryAfterSeconds: 10,
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.getByTestId('conch-stage')).toHaveAttribute('data-scene-state', 'ready');
  await page.getByLabel('소라고동에게 물어볼 질문').fill('산책할까요?');
  await page.getByRole('button', { name: '소라고동 고리 당기기' }).press('Space');
  await expect(page.getByTestId('conch-result')).toContainText(
    /잠시 기다린 뒤 다시 질문해 주세요\. \(\d+초 남음\)/,
  );
  await page.clock.fastForward(3000);
  await expect(page.getByTestId('conch-result')).toContainText(/[67]초 남음/);
  await page.getByLabel('소라고동에게 물어볼 질문').fill('내일 산책할까요?');
  await expect(page.getByRole('button', { name: '소라고동 고리 당기기' })).toHaveAttribute(
    'aria-disabled',
    'false',
  );
  await page.getByRole('button', { name: '소라고동 고리 당기기' }).press('Space');
  expect(calls).toBe(1);
  await expect(page.getByTestId('conch-result')).toContainText(/[67]초 남음/);
  await page.clock.fastForward(10_000);
  await expect(page.getByTestId('conch-result')).toHaveText('다시 질문할 수 있어요.');
  await expect(page.getByRole('button', { name: '소라고동 고리 당기기' })).toHaveAttribute(
    'aria-disabled',
    'false',
  );
});

test('일일 소진과 조회 장애를 구분하고 알 수 없는 횟수를 만들지 않는다', async ({ page }) => {
  let failing = true;
  await page.route('**/api/conch/usage', (route) =>
    failing
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'SERVICE_UNAVAILABLE', message: '조회 실패' } },
        })
      : route.fulfill({ json: { data: usage(0) } }),
  );
  await page.goto('/');
  await expect(page.getByTestId('conch-usage')).toContainText('남은 횟수 확인 불가');
  failing = false;
  await page.getByRole('button', { name: '횟수 다시 확인' }).click();
  await expect(page.getByTestId('conch-usage')).toContainText('오늘 남은 질문 0회');
  await page.getByLabel('소라고동에게 물어볼 질문').fill('산책할까요?');
  await expect(page.getByTestId('conch-stage')).toHaveAttribute('data-scene-state', 'ready');
  await expect(page.getByTestId('conch-result')).toBeEmpty();
  await page.getByRole('button', { name: '소라고동 고리 당기기' }).press('Space');
  await expect(page.getByTestId('conch-result')).toHaveText(
    '오늘 질문 횟수를 모두 사용했어요. 한국 시간 자정에 초기화돼요.',
  );
});

test('자정 초기화와 다른 화면의 사용량을 다시 조회한다', async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  await page.route('**/api/conch/usage', (route) => {
    reads += 1;
    return route.fulfill({
      json: {
        data: reads === 1 ? { ...usage(0), resetAfterSeconds: 1 } : usage(reads === 2 ? 30 : 29),
      },
    });
  });
  await page.goto('/');
  await expect(page.getByTestId('conch-usage')).toContainText('오늘 남은 질문 0회');
  await page.clock.fastForward(1500);
  await expect(page.getByTestId('conch-usage')).toContainText('오늘 남은 질문 30회');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  await expect(page.getByTestId('conch-usage')).toContainText('오늘 남은 질문 29회');
});

test('대기 시간이 없는 제한 응답은 임의의 초나 재시도 가능 안내로 바꾸지 않는다', async ({
  page,
}) => {
  await page.route('**/api/conch/usage', (route) => route.fulfill({ json: { data: usage(29) } }));
  await page.route('**/api/conch/answer', (route) =>
    route.fulfill({
      status: 429,
      json: { error: { code: 'RATE_LIMITED', message: '잠시 기다린 뒤 다시 질문해 주세요.' } },
    }),
  );
  await page.goto('/');
  await expect(page.getByTestId('conch-stage')).toHaveAttribute('data-scene-state', 'ready');
  await page.getByLabel('소라고동에게 물어볼 질문').fill('산책할까요?');
  await page.getByRole('button', { name: '소라고동 고리 당기기' }).press('Space');
  await expect(page.getByTestId('conch-result')).toHaveText('잠시 기다린 뒤 다시 질문해 주세요.');
});

for (const [width, height] of [
  [1440, 900],
  [768, 900],
  [375, 667],
]) {
  test(`횟수와 대기 안내 화면 ${width}x${height}`, async ({ page }, testInfo) => {
    await page.clock.install();
    await page.setViewportSize({ width, height });
    await page.route('**/api/conch/usage', (route) =>
      route.fulfill({ json: { data: usage(12, 10) } }),
    );
    await page.goto('/');
    await expect(page.getByTestId('conch-stage')).toHaveAttribute('data-scene-state', 'ready');
    await expect(page.getByTestId('conch-usage')).toContainText('오늘 남은 질문 12회');
    await expect(page.getByTestId('conch-result')).toBeEmpty();
    await expect(page.getByTestId('conch-cooldown')).toHaveCount(0);
    const input = page.getByLabel('소라고동에게 물어볼 질문');
    await input.fill('산책할까요?');
    const beforeInput = (await input.boundingBox())!;
    const beforeStage = (await page.getByTestId('conch-stage').boundingBox())!;
    let calls = 0;
    await page.route('**/api/conch/answer', (route) => {
      calls += 1;
      return route.fulfill({ status: 500 });
    });
    await page.getByRole('button', { name: '소라고동 고리 당기기' }).press('Space');
    await expect(page.getByTestId('conch-result')).toContainText(/\(\d+초 남음\)/);
    await expect(page.getByTestId('conch-result')).toHaveCSS('color', 'rgb(165, 40, 56)');
    expect(await input.boundingBox()).toEqual(beforeInput);
    expect(await page.getByTestId('conch-stage').boundingBox()).toEqual(beforeStage);
    expect(calls).toBe(0);
    const box = (await page.getByTestId('conch-usage').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: process.env.CONCH_CAPTURE_DIR
        ? `${process.env.CONCH_CAPTURE_DIR}/usage-${width}-${height}.png`
        : testInfo.outputPath('usage.png'),
    });
    await page.clock.fastForward(11_000);
    await expect(page.getByTestId('conch-result')).toHaveText('다시 질문할 수 있어요.');
    expect(await input.boundingBox()).toEqual(beforeInput);
    expect(await page.getByTestId('conch-stage').boundingBox()).toEqual(beforeStage);
  });
}
