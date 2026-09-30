'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { ConchScene } from '@/entities/conch';

const LOGIN_ERRORS: Record<string, string> = {
  ACCESS_DENIED: '재학생과 승인 완료 선생님만 이용할 수 있어요.',
  AUTH_FAILED: '로그인하지 못했어요. 다시 시도해 주세요.',
  INVALID_STATE: '로그인 요청이 만료됐거나 확인되지 않았어요. 다시 시작해 주세요.',
  SERVICE_UNAVAILABLE: '지금은 로그인할 수 없어요. 잠시 후 다시 시도해 주세요.',
};

const LoginView = () => {
  const params = useSearchParams();
  const code = params.get('error');
  const message = code ? (LOGIN_ERRORS[code] ?? '로그인하지 못했어요. 다시 시도해 주세요.') : null;
  return (
    <div className="conch-app">
      <header className="conch-header">
        <Link className="conch-brand" href="/">
          ◉ 마법의 소라고동
        </Link>
        <span className="conch-school-label">우리 학교만의 작은 바다</span>
      </header>
      <main className="conch-main conch-login-main">
        <section className="conch-model-section">
          <h1>
            마법의
            <br />
            소라고동
          </h1>
          <div className="conch-stage-wrap">
            <ConchScene disabled />
          </div>
        </section>
        <section className="conch-question-section">
          <h2 className="conch-intro">
            고민은 잠깐 내려놓고,
            <br />
            <strong>소라고동에게 물어봐.</strong>
          </h2>
          <p className="conch-login-copy">
            우리 학교 재학생과 선생님을 위한
            <br />
            조금 엉뚱한 답변 장난감이에요.
          </p>
          <a className="conch-login-button" href="/api/auth/login">
            DataGSM으로 로그인 <span aria-hidden="true">→</span>
          </a>
          {message && (
            <p className="conch-error conch-login-error" role="alert">
              {message}
            </p>
          )}
          <p className="conch-disclaimer">
            로그인은 1시간 동안 유지돼요.
            <br />
            DataGSM 비밀번호는 이 앱에서 받거나 저장하지 않아요.
          </p>
        </section>
      </main>
    </div>
  );
};
export default LoginView;
