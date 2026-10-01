import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// SVG 원본을 설치용 PNG로 렌더한다. 생성 파일은 배포에 포함하고 빌드 때 재생성하지 않는다.
const source = await readFile(new URL('../src/app/icon.svg', import.meta.url), 'utf8');
const imageUrl = `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`;
const icons = [
  { file: '../public/pwa/icon-192.png', size: 192, scale: 1 },
  { file: '../public/pwa/icon-512.png', size: 512, scale: 1 },
  { file: '../public/pwa/icon-maskable-512.png', size: 512, scale: 0.7 },
  { file: '../src/app/apple-icon.png', size: 180, scale: 1 },
];
const browser = await chromium.launch({ headless: true });
try {
  for (const { file, size, scale } of icons) {
    const path = fileURLToPath(new URL(file, import.meta.url));
    await mkdir(dirname(path), { recursive: true });
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    try {
      await page.setContent(
        `<!doctype html><html lang="ko"><body style="margin:0;display:grid;place-items:center;width:100vw;height:100vh;background:#E7F7F5"><img alt="마법의 소라고동" src="${imageUrl}" width="${size * scale}" height="${size * scale}"></body></html>`,
      );
      await page.locator('img').evaluate((image) => image.decode());
      await page.screenshot({ path, omitBackground: false });
      console.log(`${path}: ${size}×${size}px 생성`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
