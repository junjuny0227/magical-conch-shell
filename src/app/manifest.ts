import type { MetadataRoute } from 'next';

const manifest = (): MetadataRoute.Manifest => ({
  id: '/',
  name: '마법의 소라고동',
  short_name: '소라고동',
  description: '질문을 적고 고리를 당겨 보세요. 우리 학교만의 마법의 소라고동.',
  lang: 'ko',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#E7F7F5',
  theme_color: '#E7F7F5',
  prefer_related_applications: false,
  icons: [
    { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    {
      src: '/pwa/icon-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
});

export default manifest;
