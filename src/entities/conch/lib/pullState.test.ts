import { describe, expect, it } from 'vitest';

import { createPullState, MAX_PULL_DISTANCE } from './pullState';

it('최대 포인터 이동은 225px이며 제출 문턱은 48px로 유지한다', () => {
  const pull = createPullState();
  expect(MAX_PULL_DISTANCE).toBe(225);
  pull.begin(1, 0, 0, true, false);
  expect(pull.move(1, 500, 0)).toBe(225);
  expect(pull.release(1, false)).toBe(true);
  pull.begin(2, 0, 0, true, false);
  pull.move(2, 48, 0);
  expect(pull.release(2, false)).toBe(true);
});

describe('고리 키보드 조작', () => {
  it('Enter/Space를 놓을 때만 한 번 제출하고 반복·포인터와의 중복을 막는다', () => {
    const pull = createPullState();
    expect(pull.beginKeyboard('Enter', false, false)).toBe(true);
    expect(pull.beginKeyboard('Enter', true, false)).toBe(false);
    expect(pull.begin(1, 0, 0, true, false)).toBe(false);
    expect(pull.releaseKeyboard(' ', false)).toBe(false);
    expect(pull.releaseKeyboard('Enter', false)).toBe(true);
    expect(pull.releaseKeyboard('Enter', false)).toBe(false);
    expect(pull.beginKeyboard(' ', false, false)).toBe(true);
    expect(pull.releaseKeyboard(' ', false)).toBe(true);
  });
  it('disabled·취소·진행 중 비활성화·다른 키는 제출하지 않는다', () => {
    const pull = createPullState();
    expect(pull.beginKeyboard('Enter', false, true)).toBe(false);
    expect(pull.beginKeyboard('a', false, false)).toBe(false);
    expect(pull.beginKeyboard('Enter', true, false)).toBe(false);
    pull.beginKeyboard('Enter', false, false);
    pull.cancel();
    expect(pull.releaseKeyboard('Enter', false)).toBe(false);
    pull.beginKeyboard(' ', false, false);
    expect(pull.releaseKeyboard(' ', true)).toBe(false);
    pull.begin(1, 0, 0, true, false);
    expect(pull.beginKeyboard('Enter', false, false)).toBe(false);
  });
});

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
