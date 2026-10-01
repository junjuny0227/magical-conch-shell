import { expect, test } from '@playwright/test';

test('로그인 페이지에 소라고동 SVG 파비콘이 연결된다', async ({ page, request }) => {
  await page.goto('/login');
  const icon = page.locator('link[rel="icon"][type="image/svg+xml"]');
  await expect(icon).toHaveAttribute('href', /\/icon\.svg/);
  await expect(icon).toHaveAttribute('sizes', 'any');
  const href = await icon.getAttribute('href');
  expect(href).not.toBeNull();
  const response = await request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
  expect(await response.text()).toContain('<title>마법의 소라고동</title>');
});
