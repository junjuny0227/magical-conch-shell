import { expect, type Page, test } from '@playwright/test';

// API fixture는 시각/조작 검증 전용이며 실제 OAuth·Jeb·Redis 성공 증거가 아니다.
const session = {
  user: { id: 'fixture-student', name: '테스트 학생', objectType: 'STUDENT' },
  expiresAt: 1900000000000,
};

const findRing = async (page: Page) => {
  const canvas = page.getByTestId('conch-canvas');
  const box = (await canvas.boundingBox())!;
  for (let y = box.y + box.height * 0.1; y < box.y + box.height * 0.5; y += 5) {
    for (let x = box.x + box.width * 0.5; x < box.x + box.width * 0.95; x += 5) {
      await page.mouse.move(x, y);
      if (await canvas.evaluate((element) => element.style.cursor === 'grab')) return { x, y };
    }
  }
  throw new Error('실제 raycast로 조작할 고리를 찾지 못했습니다.');
};

for (const [width, height] of [
  [1440, 900],
  [375, 812],
]) {
  test(`최대 당김과 답변의 실제 화면 ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.route('**/api/auth/session', (route) => route.fulfill({ json: { data: session } }));
    let calls = 0;
    await page.route('**/api/conch/answer', async (route) => {
      calls += 1;
      const { requestId } = route.request().postDataJSON();
      await route.fulfill({
        json: { data: { requestId, answerId: '3', answerText: '어쩌면 언젠가는.' } },
      });
    });
    await page.goto('/');
    await page.getByLabel('소라고동에게 물어볼 질문').fill('오늘 좋은 일이 생길까요?');
    await expect(page.getByTestId('conch-stage')).toHaveAttribute('data-scene-state', 'ready');
    const hit = await findRing(page);
    await page.mouse.move(hit.x, hit.y);
    await page.mouse.down();
    await page.mouse.move(hit.x + (width < 768 ? -225 : 225), hit.y, { steps: 12 });
    // 포인터를 누른 채 캡처하여 복귀 애니메이션 이후 화면을 오인하지 않는다.
    await page.waitForTimeout(80);
    expect(calls).toBe(0);
    await page.screenshot({
      path: process.env.CONCH_CAPTURE_DIR
        ? `${process.env.CONCH_CAPTURE_DIR}/conch-pull-${width}-${height}.png`
        : testInfo.outputPath(`conch-pull-${width}-${height}.png`),
    });
    await page.mouse.up();
    await expect(page.getByTestId('conch-result')).toContainText('어쩌면 언젠가는.');
    expect(calls).toBe(1);
    await page.screenshot({
      path: process.env.CONCH_CAPTURE_DIR
        ? `${process.env.CONCH_CAPTURE_DIR}/conch-answer-${width}-${height}.png`
        : testInfo.outputPath(`conch-answer-${width}-${height}.png`),
    });
  });
}

test('모바일 터치로 고리를 당겨 질문한다', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.route('**/api/auth/session', (route) => route.fulfill({ json: { data: session } }));
    let calls = 0;
    await page.route('**/api/conch/answer', async (route) => {
      calls += 1;
      const { requestId } = route.request().postDataJSON();
      await route.fulfill({ json: { data: { requestId, answerId: '1', answerText: '응.' } } });
    });
    await page.goto(`${baseURL}/`);
    await page.getByLabel('소라고동에게 물어볼 질문').fill('산책할까요?');
    await expect(page.getByTestId('conch-stage')).toHaveAttribute('data-scene-state', 'ready');
    const hit = await findRing(page);
    const client = await context.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: hit.x, y: hit.y }],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: hit.x - 120, y: hit.y }],
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByTestId('conch-result')).toContainText('응.');
    expect(calls).toBe(1);
  } finally {
    await context.close();
  }
});
