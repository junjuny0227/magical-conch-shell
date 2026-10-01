import { describe, expect, it } from 'vitest';

import { getRemainingSeconds } from './useRetryCountdown';

describe('남은 대기 시간', () => {
  it('부분 초는 올림하고 만료 후에는 0으로 표시한다', () => {
    expect(getRemainingSeconds(10_000, 1_001)).toBe(9);
    expect(getRemainingSeconds(10_000, 9_999)).toBe(1);
    expect(getRemainingSeconds(10_000, 10_000)).toBe(0);
    expect(getRemainingSeconds(10_000, 12_000)).toBe(0);
  });
  it('탭 복귀 시 여러 초가 지나도 경과 시간을 한 번에 반영한다', () => {
    expect(getRemainingSeconds(60_000, 55_000)).toBe(5);
  });
});
