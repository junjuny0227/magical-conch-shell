// 사용자 제공 200 응답 구조를 기반으로 한 fixture이며 실제 호출 결과가 아니다.
export const jebFixture = {
  model: 'jeb',
  answers: {
    conch_answer: {
      type: 'choice',
      probabilities: { '1': 0.1, '2': 0.5, '3': 0.1, '4': 0.1, '5': 0.1, '6': 0.1 },
      choice: '2',
      confidence: 0.5,
    },
  },
  usage: { input_tokens: 204, output_tokens: 0 },
};
