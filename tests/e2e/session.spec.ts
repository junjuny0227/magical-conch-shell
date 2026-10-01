import { expect, test } from '@playwright/test';

// 브라우저 상태 검증용 fixture이며 실제 OAuth 성공을 대신하지 않는다.
const session = {
  user: { id: 'fixture-student', name: '테스트 학생', objectType: 'STUDENT' },
  expiresAt: 1900000000000,
};

test('세션 조회 장애는 미로그인으로 오인하지 않고 재시도할 수 있다', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/auth/session', (route) =>
    route.fulfill(
      unavailable
        ? {
            status: 503,
            json: { error: { code: 'SERVICE_UNAVAILABLE', message: '잠시 사용할 수 없어요.' } },
          }
        : { json: { data: session } },
    ),
  );
  await page.goto('/');
  await expect(
    page.getByRole('alert').filter({ hasText: '로그인 상태를 확인하지 못했어요.' }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.getByLabel('소라고동에게 물어볼 질문')).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByLabel('소라고동에게 물어볼 질문')).toBeVisible();
});

test('로그아웃하면 로그인 페이지로 이동하고 홈 재접근도 차단한다', async ({ page }) => {
  let loggedIn = true;
  await page.route('**/api/auth/session', (route) =>
    route.fulfill(
      loggedIn
        ? { json: { data: session } }
        : {
            status: 401,
            json: { error: { code: 'AUTH_REQUIRED', message: '로그인이 필요해요.' } },
          },
    ),
  );
  await page.route('**/api/auth/logout', (route) => {
    loggedIn = false;
    return route.fulfill({ json: { data: { success: true } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('입력창 Enter로는 제출하지 않고 질문 중 세션 만료는 로그인으로 이동한다', async ({ page }) => {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { data: session } }));
  let calls = 0;
  await page.route('**/api/conch/answer', (route) => {
    calls += 1;
    return route.fulfill({
      status: 401,
      json: { error: { code: 'AUTH_REQUIRED', message: '로그인이 필요해요.' } },
    });
  });
  await page.goto('/');
  const input = page.getByLabel('소라고동에게 물어볼 질문');
  await input.fill('오늘 산책할까요?');
  await input.press('Enter');
  expect(calls).toBe(0);
  const ring = page.getByRole('button', { name: '소라고동 고리 당기기' });
  await ring.focus();
  await ring.press('Space');
  await expect(page).toHaveURL(/\/login$/);
  expect(calls).toBe(1);
});

test('답변 대기 중 고리 재조작은 중복 요청을 만들지 않는다', async ({ page }) => {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { data: session } }));
  let calls = 0;
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/api/conch/answer', async (route) => {
    calls += 1;
    const { requestId } = route.request().postDataJSON();
    await gate;
    await route.fulfill({ json: { data: { requestId, answerId: '1', answerText: '응.' } } });
  });
  await page.goto('/');
  await page.getByLabel('소라고동에게 물어볼 질문').fill('오늘 산책할까요?');
  const ring = page.getByRole('button', { name: '소라고동 고리 당기기' });
  await ring.focus();
  await ring.press('Enter');
  await expect(page.getByTestId('conch-result')).toHaveAttribute('aria-busy', 'true');
  await ring.press('Enter');
  expect(calls).toBe(1);
  finish();
  await expect(page.getByTestId('conch-result')).toContainText('응.');
});
