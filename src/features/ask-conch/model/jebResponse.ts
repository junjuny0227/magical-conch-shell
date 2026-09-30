const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isProbability = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const isTokenCount = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** 신뢰도 임계값이나 argmax로 선택을 대체하지 않는다. */
export const parseJebResponse = (value: unknown): string => {
  if (
    !isRecord(value) ||
    value.model !== 'jeb' ||
    !isRecord(value.answers) ||
    !isRecord(value.usage)
  )
    throw new Error('잘못된 Jeb 응답');
  const answer = value.answers.conch_answer;
  if (
    !isRecord(answer) ||
    answer.type !== 'choice' ||
    typeof answer.choice !== 'string' ||
    !/^[1-6]$/.test(answer.choice) ||
    !isProbability(answer.confidence) ||
    !isRecord(answer.probabilities)
  )
    throw new Error('잘못된 Jeb 응답');
  const keys = ['1', '2', '3', '4', '5', '6'];
  if (
    Object.keys(answer.probabilities).length !== 6 ||
    keys.some((key) => !isProbability((answer.probabilities as Record<string, unknown>)[key])) ||
    !isTokenCount(value.usage.input_tokens) ||
    !isTokenCount(value.usage.output_tokens)
  )
    throw new Error('잘못된 Jeb 응답');
  return answer.choice;
};
