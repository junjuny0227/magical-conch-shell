import type { Metadata, Viewport } from 'next';

import './globals.css';
import TanStackProvider from './providers';

export const metadata: Metadata = {
  title: '마법의 소라고동',
  description: '질문을 적고 고리를 당겨 보세요. 우리 학교만의 마법의 소라고동.',
  applicationName: '마법의 소라고동',
  appleWebApp: {
    capable: true,
    title: '소라고동',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#E7F7F5',
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <html lang="ko">
      <body>
        <TanStackProvider>{children}</TanStackProvider>
      </body>
    </html>
  );
};

export default RootLayout;
