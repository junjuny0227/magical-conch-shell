export const CONCH_ANSWERS = {
  '1': '응.',
  '2': '아니.',
  '3': '어쩌면 언젠가는.',
  '4': '다시 물어봐.',
  '5': '아무것도 하지 마.',
  '6': '둘 다 안 돼.',
} as const;
export type ConchAnswerIdType = keyof typeof CONCH_ANSWERS;
