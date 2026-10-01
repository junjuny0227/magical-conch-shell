'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { ConchScene } from '@/entities/conch';
import {
  CONCH_DAILY_LIMIT,
  useGetConchUsage,
  usePostConchAnswer,
  useRetryCountdown,
} from '@/features/ask-conch';
import { isAuthRequired, useGetSession, usePostLogout } from '@/features/auth';
import { AppApiError } from '@/shared/api';
import { cn } from '@/shared/lib';

const ConchPlayground = () => {
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [validation, setValidation] = useState('');
  const [answer, setAnswer] = useState('');
  const [failure, setFailure] = useState('');
  const [rateLimited, setRateLimited] = useState(false);
  const [retryUntil, setRetryUntil] = useState(0);
  const [needsLogin, setNeedsLogin] = useState(false);
  const inFlight = useRef(false);
  const revision = useRef(0);
  const session = useGetSession();
  const logout = usePostLogout();
  const mutation = usePostConchAnswer();
  const loggedIn = Boolean(session.data) && !needsLogin && !session.isError;
  const usage = useGetConchUsage(loggedIn ? session.data?.user.id : undefined);
  const retryDeadline = Math.max(
    retryUntil,
    usage.data?.retryAfterSeconds ? usage.dataUpdatedAt + usage.data.retryAfterSeconds * 1000 : 0,
  );
  const waitSeconds = useRetryCountdown(retryDeadline);
  const dailyExhausted = !usage.isError && usage.data?.remaining === 0;
  const failureMessage = rateLimited
    ? dailyExhausted
      ? '오늘 질문 횟수를 모두 사용했어요. 한국 시간 자정에 초기화돼요.'
      : waitSeconds > 0
        ? `잠시 기다린 뒤 다시 질문해 주세요. (${waitSeconds}초 남음)`
        : '다시 질문할 수 있어요.'
    : failure;
  const pending = mutation.isPending;
  const canSubmit =
    loggedIn && !pending && question.trim().length > 0 && question.trim().length <= 300;
  const shouldRedirect = needsLogin || (session.isError && isAuthRequired(session.error));

  const handleAsk = async () => {
    if (inFlight.current) return;
    if (waitSeconds > 0 || dailyExhausted) {
      setAnswer('');
      setFailure('잠시 기다린 뒤 다시 질문해 주세요.');
      setRateLimited(true);
      return;
    }
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
    setRateLimited(false);
    try {
      const result = await mutation.mutateAsync({ question: question.trim(), requestId });
      if (revision.current === currentRevision) setAnswer(result.answerText);
    } catch (error) {
      if (revision.current === currentRevision) {
        if (error instanceof AppApiError && error.code === 'RATE_LIMITED') {
          if (Number.isSafeInteger(error.retryAfterSeconds) && (error.retryAfterSeconds ?? 0) > 0) {
            setRateLimited(true);
            setRetryUntil(Date.now() + Math.min(error.retryAfterSeconds!, 86400) * 1000);
          }
        }
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

  useEffect(() => {
    if (shouldRedirect) router.replace('/login');
  }, [router, shouldRedirect]);

  if (session.isPending || shouldRedirect)
    return <main className="conch-loading" aria-busy="true" aria-label="로그인 상태 확인" />;

  if (session.isError)
    return (
      <main className="conch-loading">
        <div className="conch-session-error" role="alert">
          <p>로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          <button className="conch-text-button" onClick={() => void session.refetch()}>
            다시 확인
          </button>
        </div>
      </main>
    );

  return (
    <div className="conch-app">
      <button
        className="conch-text-button conch-logout"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
      >
        {logout.isPending ? '로그아웃 중' : '로그아웃'}
      </button>
      <main className="conch-main" aria-label="마법의 소라고동">
        <section className="conch-model-section" aria-label="소라고동">
          <div className="conch-stage-wrap">
            <ConchScene
              disabled={!canSubmit}
              onPull={() => {
                void handleAsk();
              }}
            />
          </div>
        </section>
        <section className="conch-question-section" aria-label="질문과 답변">
          <div
            data-testid="conch-result"
            className={cn('conch-result', failure && 'conch-result-error')}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-busy={pending}
          >
            {pending ? (
              <p className="conch-result-wait">답변을 기다리고 있어요.</p>
            ) : failure ? (
              <p className="conch-result-wait">{failureMessage}</p>
            ) : answer ? (
              <p className="conch-answer">“{answer}”</p>
            ) : null}
          </div>
          <div className="conch-question-field">
            <label className="sr-only" htmlFor="conch-question">
              소라고동에게 물어볼 질문
            </label>
            <textarea
              id="conch-question"
              value={question}
              maxLength={300}
              placeholder="지금 숙제를 해야 할까요?"
              aria-describedby={
                validation
                  ? 'question-hint question-usage question-error'
                  : 'question-hint question-usage'
              }
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
            <p id="question-hint" className="mt-2 text-center text-sm text-[var(--conch-muted)]">
              질문을 입력하고 고리를 당겨 주세요.
            </p>
            <p
              id="question-usage"
              className="mt-1 text-center text-sm text-[var(--conch-muted)]"
              data-testid="conch-usage"
            >
              하루 최대 {usage.data?.dailyLimit ?? CONCH_DAILY_LIMIT}회 ·{' '}
              {usage.isError
                ? '남은 횟수 확인 불가'
                : usage.isPending || usage.isFetching
                  ? '남은 횟수 확인 중…'
                  : `오늘 남은 질문 ${usage.data.remaining}회`}
            </p>
            {usage.isError && (
              <div className="text-center">
                <button className="conch-text-button" onClick={() => void usage.refetch()}>
                  횟수 다시 확인
                </button>
              </div>
            )}

            <p id="question-error" className="conch-error">
              {validation}
            </p>
          </div>
          {logout.isError && (
            <p className="conch-error" role="alert">
              로그아웃하지 못했어요. 다시 시도해 주세요.
            </p>
          )}
        </section>
      </main>
    </div>
  );
};

export default ConchPlayground;
