'use client';

import { useRef, useState } from 'react';

import Link from 'next/link';

import { ConchScene } from '@/entities/conch';
import { usePostConchAnswer } from '@/features/ask-conch';
import { isAuthRequired, useGetSession, usePostLogout } from '@/features/auth';
import { AppApiError } from '@/shared/api';
import { cn } from '@/shared/lib';

const ConchPlayground = () => {
  const [question, setQuestion] = useState('');
  const [validation, setValidation] = useState('');
  const [answer, setAnswer] = useState('');
  const [failure, setFailure] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const inFlight = useRef(false);
  const revision = useRef(0);
  const session = useGetSession();
  const logout = usePostLogout();
  const mutation = usePostConchAnswer();
  const loggedIn = Boolean(session.data) && !needsLogin && !session.isError;
  const pending = mutation.isPending;
  const canSubmit =
    loggedIn && !pending && question.trim().length > 0 && question.trim().length <= 300;
  const sessionMessage = session.isPending
    ? '로그인 상태를 확인하고 있어요.'
    : session.isError && !isAuthRequired(session.error)
      ? '로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'
      : '';

  const handleAsk = async () => {
    if (inFlight.current) return;
    if (!loggedIn) {
      setNeedsLogin(true);
      return;
    }
    if (!question.trim() || question.trim().length > 300) {
      setValidation('질문을 1~300자로 입력해 주세요.');
      return;
    }
    inFlight.current = true;
    const currentRevision = revision.current;
    const requestId = crypto.randomUUID();
    setAnswer('');
    setFailure('');
    setValidation('');
    try {
      const result = await mutation.mutateAsync({ question: question.trim(), requestId });
      if (revision.current === currentRevision) setAnswer(result.answerText);
    } catch (error) {
      if (revision.current === currentRevision) {
        setFailure(
          error instanceof AppApiError
            ? error.message
            : '답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.',
        );
        if (isAuthRequired(error)) setNeedsLogin(true);
      }
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div className="conch-app">
      <header className="conch-header">
        <Link href="/" className="conch-brand" aria-label="마법의 소라고동 홈">
          <span aria-hidden="true">◉</span> 마법의 소라고동
        </Link>
        {loggedIn ? (
          <div className="conch-account">
            <span>{session.data?.user.objectType === 'TEACHER' ? '선생님' : '재학생'} 전용</span>
            <button
              className="conch-text-button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              {logout.isPending ? '로그아웃 중' : '로그아웃'}
            </button>
          </div>
        ) : (
          <span className="conch-school-label">우리 학교만의 작은 바다</span>
        )}
      </header>
      <main className="conch-main">
        <section className="conch-model-section" aria-labelledby="conch-title">
          <h1 id="conch-title">
            마법의
            <br />
            소라고동
          </h1>
          <div className="conch-stage-wrap">
            <ConchScene
              disabled={!canSubmit}
              onPull={() => {
                void handleAsk();
              }}
            />
          </div>
          <p className="conch-pull-hint">
            {pending ? '소라고동이 생각하고 있어요.' : '질문을 적고, 오른쪽 고리를 당겨 보세요.'}
          </p>
        </section>
        <section className="conch-question-section" aria-label="질문과 답변">
          <p className="conch-intro">
            갈림길에 섰다면,
            <br />
            <strong>소라고동에게 물어봐.</strong>
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleAsk();
            }}
          >
            <div className="conch-label-row">
              <label htmlFor="conch-question">소라고동에게 물어볼 질문</label>
              <span>{question.length}/300</span>
            </div>
            <textarea
              id="conch-question"
              value={question}
              maxLength={300}
              placeholder="지금 숙제를 해야 할까요?"
              aria-describedby="question-help question-error"
              aria-invalid={Boolean(validation)}
              disabled={pending}
              onChange={(event) => {
                setQuestion(event.target.value);
                revision.current += 1;
                setAnswer('');
                setFailure('');
                setValidation('');
              }}
            />
            <p id="question-help" className="conch-field-help">
              한 번에 하나씩, 짧게 물어봐 주세요.
            </p>
            <p id="question-error" className="conch-error">
              {validation}
            </p>
            <button className="conch-primary-button" type="submit" disabled={!canSubmit}>
              {pending ? '답변을 기다리는 중…' : '소라고동에게 묻기'}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          {!loggedIn && !session.isPending && (
            <div className="conch-login-notice">
              <p>
                {needsLogin
                  ? '세션이 만료됐어요. 질문은 그대로 두었어요.'
                  : '재학생과 선생님만 사용할 수 있어요.'}
              </p>
              <a className="conch-login-button" href="/api/auth/login">
                DataGSM으로 로그인 <span aria-hidden="true">→</span>
              </a>
            </div>
          )}
          {sessionMessage && (
            <p className="conch-status" role="status">
              {sessionMessage}
              {session.isError && (
                <button
                  className="conch-text-button"
                  onClick={() => {
                    void session.refetch();
                  }}
                >
                  다시 확인
                </button>
              )}
            </p>
          )}
          <div
            data-testid="conch-result"
            className={cn('conch-result', failure && 'conch-result-error')}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-busy={pending}
          >
            <span className="conch-result-label">소라고동의 한마디</span>
            {pending ? (
              <p className="conch-result-wait">답변을 기다리고 있어요.</p>
            ) : failure ? (
              <p className="conch-result-wait">{failure}</p>
            ) : answer ? (
              <p className="conch-answer">“{answer}”</p>
            ) : (
              <p className="conch-result-empty">아직 아무 말도 하지 않았어요.</p>
            )}
          </div>
          {logout.isError && (
            <p className="conch-error" role="alert">
              로그아웃하지 못했어요. 다시 시도해 주세요.
            </p>
          )}
          <p className="conch-disclaimer">
            소라고동의 답은 오락용이에요.
            <br />
            건강·안전 등 중요한 결정은 믿을 수 있는 사람과 상의하세요.
          </p>
        </section>
      </main>
      <footer className="conch-footer">
        <span>질문은 영구 저장하지 않아요.</span>
        <span>답변 선택 · Jeb</span>
      </footer>
    </div>
  );
};

export default ConchPlayground;
