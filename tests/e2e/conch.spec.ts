import { expect, test } from '@playwright/test';

// 브라우저 상태 검증 전용 fixture. 실제 OAuth·Jeb·Redis 연동 증거가 아니다.
const session = {
  user: { id: 'fixture-student', name: '테스트 학생', objectType: 'STUDENT' },
  expiresAt: 1900000000000,
};

test('로그인이 필요한 이용자는 질문을 제출할 수 없다', async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: 'AUTH_REQUIRED', message: '로그인이 필요해요.' } },
    }),
  );
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('link', { name: 'DataGSM으로 로그인' })).toBeVisible();
  await expect(page.getByLabel('소라고동에게 물어볼 질문')).toHaveCount(0);
  await expect(page.getByRole('banner')).toHaveCount(0);
});

test('질문 한 번 제출은 한 번의 호출로 답변을 표시한다', async ({ page }) => {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { data: session } }));
  let calls = 0;
  await page.route('**/api/conch/answer', async (route) => {
    calls += 1;
    const { requestId } = route.request().postDataJSON();
    await route.fulfill({ json: { data: { requestId, answerId: '2', answerText: '아니.' } } });
  });
  await page.goto('/');
  await page.getByLabel('소라고동에게 물어볼 질문').fill('지금 숙제를 해야 할까요?');
  await expect(page.getByRole('button', { name: '소라고동에게 묻기' })).toHaveCount(0);
  const ring = page.getByRole('button', { name: '소라고동 고리 당기기' });
  await ring.focus();
  await ring.press('Enter');
  await expect(page.getByTestId('conch-result')).toContainText('아니.');
  expect(calls).toBe(1);
});

test('API 오류는 정상 대사로 숨기지 않고 질문을 유지한다', async ({ page }) => {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { data: session } }));
  await page.route('**/api/conch/answer', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'SERVICE_UNAVAILABLE', message: '잠시 사용할 수 없어요.' } },
    }),
  );
  await page.goto('/');
  await page.getByLabel('소라고동에게 물어볼 질문').fill('오늘 산책할까요?');
  const ring = page.getByRole('button', { name: '소라고동 고리 당기기' });
  await ring.focus();
  await ring.press('Enter');
  await expect(page.getByTestId('conch-result')).toContainText('잠시 사용할 수 없어요.');
  await expect(page.getByTestId('conch-result')).toHaveClass(/\bconch-result-error\b/);
  await expect(page.getByLabel('소라고동에게 물어볼 질문')).toHaveValue('오늘 산책할까요?');
});

test('실제 3D 고리를 충분히 당긴 뒤 놓을 때 한 번만 제출한다', async ({ page }) => {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { data: session } }));
  let calls = 0;
  await page.route('**/api/conch/answer', async (route) => {
    calls += 1;
    const { requestId } = route.request().postDataJSON();
    await route.fulfill({ json: { data: { requestId, answerId: '1', answerText: '응.' } } });
  });
  await page.goto('/');
  await page.getByLabel('소라고동에게 물어볼 질문').fill('오늘 산책할까요?');
  await expect(page.getByTestId('conch-stage')).toHaveAttribute('data-scene-state', 'ready');
  const canvas = page.getByTestId('conch-canvas');
  const box = (await canvas.boundingBox())!;
  let hit: { x: number; y: number } | undefined;
  for (let y = box.y + box.height * 0.1; y < box.y + box.height * 0.4 && !hit; y += 5) {
    for (let x = box.x + box.width * 0.55; x < box.x + box.width * 0.85; x += 5) {
      await page.mouse.move(x, y);
      if (await canvas.evaluate((element) => element.style.cursor === 'grab')) {
        hit = { x, y };
        break;
      }
    }
  }
  expect(hit, '실제 raycast로 고리를 찾아야 한다').toBeDefined();
  if (!hit) return;
  await page.mouse.move(hit.x, hit.y);
  await page.mouse.down();
  await page.mouse.move(hit.x + 10, hit.y);
  await page.mouse.up();
  expect(calls).toBe(0);
  // 짧은 드래그의 240ms 복귀 애니메이션이 끝난 뒤 같은 고리를 잡는다.
  await page.waitForTimeout(280);
  await page.mouse.move(hit.x, hit.y);
  await page.mouse.down();
  await page.mouse.move(hit.x + 80, hit.y - 10, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('conch-result')).toContainText('응.');
  expect(calls).toBe(1);
});

test('WebGL 실패 뒤 정적 대체 화면과 키보드 질문이 동작한다', async ({ page }) => {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { data: session } }));
  await page.route('**/api/conch/answer', async (route) => {
    const { requestId } = route.request().postDataJSON();
    await route.fulfill({ json: { data: { requestId, answerId: '2', answerText: '아니.' } } });
  });
  await page.goto('/');
  await expect(page.getByTestId('conch-stage')).toHaveAttribute('data-scene-state', 'ready');
  await page
    .getByTestId('conch-canvas')
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
    );
  await expect(page.getByTestId('conch-fallback')).toBeVisible();
  await expect(page.getByTestId('conch-canvas')).toHaveCount(0);
  await page.getByLabel('소라고동에게 물어볼 질문').fill('내일로 미룰까요?');
  const button = page.getByRole('button', { name: '소라고동 고리 당기기' });
  await button.focus();
  await button.press('Enter');
  await expect(page.getByTestId('conch-result')).toContainText('아니.');
});
