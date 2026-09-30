import { describe, expect, it } from 'vitest';

import { validateQuestion } from './question';

describe('질문 검증', () => {
  it('앞뒤 공백을 제거하고 1~300자를 허용한다', () => {
    expect(validateQuestion('  안녕?  ')).toBe('안녕?');
    expect(validateQuestion('가'.repeat(300))).toHaveLength(300);
  });
  it.each([null, {}, 1, '', '   ', '가'.repeat(301)])('잘못된 질문을 거부한다: %s', (value) => {
    expect(() => validateQuestion(value)).toThrow();
  });
});
