// 명시적인 고위험 표현에 대한 보조 필터다. 의미 기반 안전 분류나 모든 우회 차단을 보장하지 않는다.
const HIGH_STAKES_PATTERNS = [
  /자살|자해|죽고\s*싶|목숨|살인|죽일|때릴|폭행|칼로|총으로/i,
  /약.{0,20}(먹|복용|두\s*배|중단)|복용량|수술|진단|치료|임신/i,
  /주식|코인|대출|투자|전\s*재산|계약서|소송|고소/i,
  /suicid|self[ -]?harm|kill\s+(myself|someone)|medication|dosage|invest/i,
];

export const isHighStakesQuestion = (question: string): boolean =>
  HIGH_STAKES_PATTERNS.some((pattern) => pattern.test(question.normalize('NFKC')));
