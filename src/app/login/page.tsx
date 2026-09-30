import { Suspense } from 'react';

import { LoginView } from '@/views/login';

const LoginPage = () => (
  <Suspense fallback={<main className="conch-loading">로그인 화면을 준비하고 있어요.</main>}>
    <LoginView />
  </Suspense>
);

export default LoginPage;
