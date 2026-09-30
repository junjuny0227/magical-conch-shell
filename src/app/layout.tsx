import type { Metadata } from 'next';

import './globals.css';
import TanStackProvider from './providers';

export const metadata: Metadata = {
  title: '마법의 소라고동',
  description: '질문을 적고 고리를 당겨 보세요. 우리 학교만의 마법의 소라고동.',
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
