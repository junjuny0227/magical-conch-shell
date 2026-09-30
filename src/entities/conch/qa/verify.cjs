/* eslint-disable @typescript-eslint/no-require-imports -- 장면 검증용 Node CommonJS 진입점 */
/* 실제 WebGL 장면의 포인터·복귀·정리 검증. 단독 하니스이며 인증 모의가 아니다. */
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const output = path.join(__dirname, 'evidence');
  fs.mkdirSync(output, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 650, height: 500 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:3217');
  await page.waitForSelector('body[data-ready="true"]');
  await page.locator('#stage').screenshot({ path: path.join(output, 'desktop-idle.png') });
  // 실제 raycast 결과인 커서로 고리 표면을 찾는다. 모델 위치를 강제로 조작하지 않는다.
  let hit;
  for (let y = 75; y < 175 && !hit; y += 3)
    for (let x = 375; x < 470; x += 3) {
      await page.mouse.move(x, y);
      if (await page.locator('canvas').evaluate((canvas) => canvas.style.cursor === 'grab')) {
        hit = { x, y };
        break;
      }
    }
  if (!hit) throw Error('고리를 실제 raycast로 찾지 못함');
  await page.mouse.move(hit.x, hit.y);
  await page.mouse.down();
  await page.mouse.move(hit.x + 10, hit.y);
  await page.mouse.up();
  if ((await page.evaluate(() => window.sceneTest.pulls)) !== 0)
    throw Error('짧은 당기기가 제출됨');
  await page.waitForTimeout(280);
  await page.mouse.move(hit.x, hit.y);
  await page.mouse.down();
  await page.mouse.move(hit.x + 75, hit.y - 20, { steps: 8 });
  await page.locator('#stage').screenshot({ path: path.join(output, 'desktop-pull.png') });
  await page.mouse.up();
  await page.waitForTimeout(280);
  if ((await page.evaluate(() => window.sceneTest.pulls)) !== 1)
    throw Error('긴 당기기 제출 횟수 오류');
  await page.locator('#stage').screenshot({ path: path.join(output, 'desktop-return.png') });
  await page.mouse.move(hit.x, hit.y);
  await page.mouse.down();
  await page.mouse.move(hit.x + 75, hit.y);
  await page.evaluate(() => window.sceneTest.setDisabled(true));
  await page.mouse.up();
  if ((await page.evaluate(() => window.sceneTest.pulls)) !== 1) throw Error('비활성화 후 제출됨');
  await page.evaluate(() => window.sceneTest.setDisabled(false));
  await page.waitForTimeout(280);
  await page.mouse.move(hit.x, hit.y);
  await page.mouse.down();
  await page.mouse.move(hit.x + 75, hit.y);
  await page.evaluate(() =>
    document
      .querySelector('canvas')
      .dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })),
  );
  await page.mouse.up();
  await page.waitForTimeout(280);
  if ((await page.evaluate(() => window.sceneTest.pulls)) !== 1) throw Error('취소 후 제출됨');
  await page.mouse.move(250, 250);
  await page.mouse.down();
  await page.mouse.move(340, 250);
  await page.mouse.up();
  if ((await page.evaluate(() => window.sceneTest.pulls)) !== 1) throw Error('몸통에서 제출됨');
  const backingSize = await page
    .locator('canvas')
    .evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
  if (backingSize.width !== 900 || backingSize.height !== 690) throw Error('DPR 상한 오류');
  await page.evaluate(() =>
    document
      .querySelector('canvas')
      .dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
  );
  await page.waitForSelector('body[data-failed="true"]');
  if ((await page.locator('canvas').count()) !== 0) throw Error('실패 후 캔버스 잔존');
  await page.setViewportSize({ width: 375, height: 430 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:3217?width=375&height=360');
  await page.waitForSelector('body[data-ready="true"]');
  await page.locator('#stage').screenshot({ path: path.join(output, 'mobile-reduced.png') });
  await page.evaluate(() => {
    window.sceneTest.destroy();
    window.sceneTest.destroy();
  });
  if (errors.length) throw Error(errors.join('\n'));
  console.log(
    JSON.stringify(
      {
        ready: true,
        hit,
        submissions: 1,
        shortRejected: true,
        disabledRejected: true,
        bodyRejected: true,
        contextLossDisposed: true,
        DPR: backingSize,
        mobileReducedRendered: true,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
