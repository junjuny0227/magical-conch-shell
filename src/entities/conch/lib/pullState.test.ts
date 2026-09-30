import { describe, expect, it } from 'vitest';

import { createPullState } from './pullState';

describe('고리 당기기 상태', () => {
  it('고리에서 시작한 문턱 이상의 현재 거리만 한 번 제출한다', () => {
    const pull = createPullState();
    expect(pull.begin(1, 10, 20, false, false)).toBe(false);
    expect(pull.begin(1, 10, 20, true, false)).toBe(true);
    expect(pull.begin(2, 10, 20, true, false)).toBe(false);
    expect(pull.move(2, 80, 20)).toBe(0);
    expect(pull.move(1, 80, 20)).toBe(70);
    expect(pull.release(1, false)).toBe(true);
    expect(pull.release(1, false)).toBe(false);
  });
  it('짧은 당기기, 취소, 진행 중 비활성화는 제출하지 않는다', () => {
    const pull = createPullState();
    pull.begin(1, 0, 0, true, false);
    pull.move(1, 47, 0);
    expect(pull.release(1, false)).toBe(false);
    pull.begin(2, 0, 0, true, false);
    pull.move(2, 70, 0);
    pull.cancel();
    expect(pull.release(2, false)).toBe(false);
    pull.begin(3, 0, 0, true, false);
    pull.move(3, 70, 0);
    expect(pull.release(3, true)).toBe(false);
    expect(pull.begin(4, 0, 0, true, true)).toBe(false);
    pull.begin(5, 0, 0, true, false);
    pull.move(5, 70, 0);
    pull.move(5, 12, 0);
    expect(pull.release(5, false)).toBe(false);
  });
});
