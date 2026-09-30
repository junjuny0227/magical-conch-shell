import { describe, expect, it } from 'vitest';

import { jebFixture } from './jebFixture';
import { parseJebResponse } from './jebResponse';

describe('Jeb 응답 전체 검증', () => {
  it('정상 응답에서 선택 키를 반환한다', () => {
    expect(parseJebResponse(jebFixture)).toBe('2');
  });
  it.each([
    null,
    {},
    { ...jebFixture, model: 'other' },
    { ...jebFixture, usage: { input_tokens: -1, output_tokens: 0 } },
    ...['7', 2, null].map((choice) => ({
      ...jebFixture,
      answers: { conch_answer: { ...jebFixture.answers.conch_answer, choice } },
    })),
    ...[
      { confidence: 2 },
      { confidence: NaN },
      { probabilities: { '1': 1 } },
      { probabilities: { ...jebFixture.answers.conch_answer.probabilities, '2': -1 } },
      { type: 'score' },
    ].map((patch) => ({
      ...jebFixture,
      answers: { conch_answer: { ...jebFixture.answers.conch_answer, ...patch } },
    })),
  ])('손상되거나 계약 밖인 응답을 거부한다', (value) => {
    expect(() => parseJebResponse(value)).toThrow();
  });
});
