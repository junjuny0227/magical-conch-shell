import { expect, test } from '@playwright/test';

test('설치용 manifest와 홈 화면 아이콘을 제공한다', async ({ page, request }) => {
  await page.goto('/login');
  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveAttribute('href', '/manifest.webmanifest');
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: '/',
    name: '마법의 소라고동',
    short_name: '소라고동',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'ko',
    background_color: '#E7F7F5',
    theme_color: '#E7F7F5',
    prefer_related_applications: false,
  });
  expect(manifest.icons).toEqual([
    { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]);
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src);
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toContain('image/png');
    const png = await image.body();
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
  }
});

test('iOS 설치 메타데이터와 아이콘을 제공하고 서비스 워커 캐시는 만들지 않는다', async ({
  page,
  request,
}) => {
  await page.goto('/login');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#E7F7F5');
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    'content',
    '소라고동',
  );
  const appleIcon = page.locator('link[rel="apple-touch-icon"]');
  await expect(appleIcon).toHaveAttribute('sizes', '180x180');
  const href = await appleIcon.getAttribute('href');
  expect(href).not.toBeNull();
  const response = await request.get(href!);
  expect(response.status()).toBe(200);
  const png = await response.body();
  expect(png.readUInt32BE(16)).toBe(180);
  expect(png.readUInt32BE(20)).toBe(180);
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0);
});
