export interface ConchAnswerReqType {
  question: string;
  requestId: string;
}

export interface ConchAnswerType {
  requestId: string;
  answerId: string;
  answerText: string;
}

export interface ConchAnswerResponseType {
  data: ConchAnswerType;
}

/** 양끝 공백을 제외한 질문을 검증한다. */
export const validateQuestion = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('질문을 입력해 주세요.');
  const question = value.trim();
  if (question.length < 1 || question.length > 300)
    throw new Error('질문은 1~300자로 입력해 주세요.');
  return question;
};
