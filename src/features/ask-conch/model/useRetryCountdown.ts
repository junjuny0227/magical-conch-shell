'use client';

import { useEffect, useState } from 'react';

export const getRemainingSeconds = (deadline: number, now: number) =>
  Math.max(0, Math.ceil((deadline - now) / 1000));

export const useRetryCountdown = (deadline: number) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const update = () => setNow(Date.now());
    // 백그라운드 타이머가 멈췄다가 복귀해도 실제 경과 시간을 기준으로 갱신한다.
    const timer =
      deadline > Date.now()
        ? window.setInterval(() => {
            update();
            if (Date.now() >= deadline) window.clearInterval(timer);
          }, 250)
        : undefined;
    const initial = window.setTimeout(update, 0);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(initial);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [deadline]);

  return getRemainingSeconds(deadline, now);
};
