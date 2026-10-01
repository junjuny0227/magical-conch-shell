import { expect, test } from '@playwright/test';
import { OrthographicCamera, Vector3 } from 'three';

import { createConchModel } from '../../src/entities/conch/lib/conchModel';

// 카메라 투영으로 고리의 실제 중앙 좌표를 구한다. 모델/입력 상태는 변경하지 않는다.
const ringCenter = (box: { x: number; y: number; width: number; height: number }) => {
  const model = createConchModel();
  model.root.rotation.set(0, -0.1, 0.025);
  model.root.updateMatrixWorld(true);
  const viewHeight = Math.max(4.6, (4.6 * box.height) / box.width);
  const viewWidth = (viewHeight * box.width) / box.height;
  const camera = new OrthographicCamera(
    -viewWidth / 2,
    viewWidth / 2,
    viewHeight / 2,
    -viewHeight / 2,
    0.1,
    20,
  );
  camera.position.set(0.05, 0.1, 7);
  camera.lookAt(-0.12, -0.12, 0);
  camera.updateMatrixWorld(true);
  const center = model.ring.getWorldPosition(new Vector3()).project(camera);
  model.dispose();
  return {
    x: box.x + ((center.x + 1) / 2) * box.width,
    y: box.y + ((1 - center.y) / 2) * box.height,
  };
};

for (const [width, height] of [
  [1440, 900],
  [768, 900],
  [375, 667],
]) {
  test(`고리 가운데 구멍부터 당기기 ${width}x${height}`, async ({ browser, baseURL }, testInfo) => {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: width === 375,
      hasTouch: width === 375,
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/_vercel/insights/script.js', (route) =>
        route.fulfill({ contentType: 'application/javascript', body: '' }),
      );
      await page.route('https://va.vercel-scripts.com/**', (route) =>
        route.fulfill({ contentType: 'application/javascript', body: '' }),
      );
      // 인증·Jeb fixture이며 실제 외부 서비스 성공 증거는 아니다.
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
      let calls = 0;
      await page.route('**/api/conch/answer', (route) => {
        calls += 1;
        const { requestId } = route.request().postDataJSON();
        return route.fulfill({ json: { data: { requestId, answerId: '1', answerText: '응.' } } });
      });
      await page.goto(`${baseURL}/`);
      await expect(page.getByTestId('conch-stage')).toHaveAttribute('data-scene-state', 'ready');
      await page.getByLabel('소라고동에게 물어볼 질문').fill('산책할까요?');
      const canvas = page.getByTestId('conch-canvas');
      const box = (await canvas.boundingBox())!;
      const center = ringCenter(box);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await expect(canvas).toHaveCSS('cursor', 'default');
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2);
      await page.mouse.up();
      expect(calls).toBe(0);
      await page.mouse.move(center.x, center.y);
      await expect(canvas).toHaveCSS('cursor', 'grab');
      await page.mouse.click(center.x, center.y);
      expect(calls).toBe(0);
      await page.screenshot({
        path: process.env.CONCH_CAPTURE_DIR
          ? `${process.env.CONCH_CAPTURE_DIR}/ring-center-before-${width}.png`
          : testInfo.outputPath('before.png'),
      });
      if (width === 375) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: center.x, y: center.y }],
        });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: center.x - 120, y: center.y }],
        });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.down();
        await page.mouse.move(center.x - 120, center.y, { steps: 8 });
        await page.mouse.up();
      }
      await expect(page.getByTestId('conch-result')).toContainText('응.');
      expect(calls).toBe(1);
      await page.waitForTimeout(300);
      await page.screenshot({
        path: process.env.CONCH_CAPTURE_DIR
          ? `${process.env.CONCH_CAPTURE_DIR}/ring-center-after-${width}.png`
          : testInfo.outputPath('after.png'),
      });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('SVG 대체 화면도 고리 구멍에서 당길 수 있다', async ({ page }) => {
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
  let calls = 0;
  await page.route('**/api/conch/answer', (route) => {
    calls += 1;
    const { requestId } = route.request().postDataJSON();
    return route.fulfill({ json: { data: { requestId, answerId: '1', answerText: '응.' } } });
  });
  await page.goto('/');
  await expect(page.getByTestId('conch-stage')).toHaveAttribute('data-scene-state', 'ready');
  await page
    .getByTestId('conch-canvas')
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
    );
  await expect(page.getByTestId('conch-fallback')).toBeVisible();
  await page.getByLabel('소라고동에게 물어볼 질문').fill('산책할까요?');
  const hole = page.getByRole('button', { name: '소라고동 고리 당기기' }).locator('circle').last();
  const box = (await hole.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('conch-result')).toContainText('응.');
  expect(calls).toBe(1);
});
