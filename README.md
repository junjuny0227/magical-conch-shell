# 마법의 소라고동

우리 학교 **재학생과 승인 완료 선생님**이 DataGSM으로 로그인하고, 질문을 적은 뒤 직접 제작한 Three.js 소라고동의 고리를 당기는 웹 앱입니다. Jeb의 `choice` 응답을 검증해 고정 단답 대사로 표시합니다. 답변은 오락용이며 중요한 의사결정에 사용하지 않습니다.

Next.js App Router · React · TypeScript · Tailwind CSS · TanStack Query · Three.js · Upstash Redis 기반 단일 앱입니다.

## 시작하기

```sh
pnpm install
cp .env.example .env.local
# .env.local의 placeholder를 실제 등록·연결 값으로 교체
NODE_ENV=development pnpm dev --port 3100
```

로컬 화면은 `http://localhost:3100`에서 확인합니다. 실제 인증·질문에는 다음 설정이 모두 필요합니다. 설정이 없거나 Redis 연결이 실패하면 서비스 오류를 반환하며 가짜 로그인·무작위 답변으로 대체하지 않습니다.

| 환경 변수                  | 용도                                                                       |
| -------------------------- | -------------------------------------------------------------------------- |
| `API_BASE_URL`             | 기존 `/backend` rewrite 설정에 필수. 소라고동 API는 자체 `/api`를 사용     |
| `APP_ORIGIN`               | 고정 앱 출처. 로컬 예시 `http://localhost:3100`, 배포는 HTTPS              |
| `DATAGSM_CLIENT_ID`        | 등록된 DataGSM OAuth client ID                                             |
| `DATAGSM_REDIRECT_URI`     | 등록한 `${APP_ORIGIN}/api/auth/callback`, 앱과 정확히 같은 출처            |
| `UPSTASH_REDIS_REST_URL`   | 관리형 Redis REST endpoint                                                 |
| `UPSTASH_REDIS_REST_TOKEN` | 서버 전용 Redis 토큰                                                       |
| `REDIS_NAMESPACE`          | 환경별 별도 키 공간. 운영은 명시 필수이며 `conch:v1:development` 사용 금지 |
| `JEB_API_KEY`              | 서버 전용 Jeb 키                                                           |

DataGSM client에는 `datagsm:self_read` 권한이 필요합니다. 운영·preview는 각각 callback과 Redis namespace를 분리합니다. 비밀값에 `NEXT_PUBLIC_`을 붙이지 않으며 실제 환경 파일은 커밋하지 않습니다. 외부 서비스 생성·비용 발생·배포는 별도 승인 사항입니다.

## 기능과 경계

- 서버 주도 PKCE·state·5분 일회성 OAuth 거래, 사용자 유형·상태·학생 역할 검사.
- HttpOnly 쿠키에는 opaque ID만 저장하고 Redis에서 고정 1시간 세션을 확인합니다. 장기 refresh token을 저장하지 않습니다.
- 로그아웃과 질문 API는 고정 Origin을 확인합니다. 토큰·학생 프로필을 Jeb에 전달하지 않습니다.
- 질문은 1~300자. Jeb 호출은 자동 재시도 없이 10초 timeout을 적용합니다.
- Redis 원자적 예약으로 사용자 일 30회·10초 간격·공용 일 9,500회·동시 슬롯 5개를 관리합니다. 한도 날짜는 KST 기준입니다.
- 요청 ID·질문 해시·결과를 단기 보관해 중복 호출을 막습니다. timeout 등 모호한 결과는 슬롯 lease를 즉시 제거하지 않습니다. 질문 원문·영구 이력은 저장하지 않습니다.
- 명시적인 고위험 표현은 외부 호출 전에 거부합니다. 키워드 기반 보조 필터이므로 모든 표현·우회를 차단하는 안전 분류기로 간주하지 않습니다.
- 직접 제작한 3D 모델·고리·줄, 포인터 당기기·복귀, 키보드 버튼, reduced-motion과 WebGL 실패 시 SVG 대체 화면을 제공합니다.
- 장애를 정상 소라고동 대사로 위장하지 않습니다.

## 구조

```text
src/
├── app/       얇은 라우트·Route Handler, 전역 스타일·Provider
├── views/     home·login 페이지 구성
├── widgets/   conch-playground 화면 조합
├── features/  auth·ask-conch 사용자 액션과 서버 처리
├── entities/  account 자격·세션, conch 모델·대사·장면
└── shared/    API client·서버 설정·Redis·오류·공통 유틸
```

의존성은 `app → views → widgets → features → entities → shared` 방향으로만 흐릅니다. 클라이언트 공개 API와 `index.server.ts`를 분리합니다. 기존 브라우저 `/backend`·서버 `API_BASE_URL` 래퍼는 보존하며 앱 동일 출처 API에는 `requestApp`을 사용합니다. 이 함수는 응답의 `data`를 이미 꺼내 반환합니다.

## 검증

```sh
pnpm peers check
pnpm lint
pnpm lint:fsd
pnpm format:check
API_BASE_URL=http://localhost:8080 pnpm check-types
API_BASE_URL=http://localhost:8080 pnpm build
NODE_ENV=test pnpm test
pnpm exec playwright install chromium
NODE_ENV=test pnpm test:e2e
```

브라우저 테스트의 OAuth·Jeb 응답은 명시적 fixture입니다. 실제 3D 렌더·포인터와 화면 상태를 검증하지만 외부 서비스 실연동 증거는 아닙니다. localhost Redis와 `redis-cli`가 없으면 실제 Lua 경쟁 조건 테스트 4개는 건너뜁니다. 전용 테스트 Redis가 있다면 `CONCH_TEST_REDIS_PORT`를 지정해 `pnpm test src/features/ask-conch/api/reservationRedis.test.ts`로 실행할 수 있습니다. 이 검사는 무작위 테스트 prefix만 사용하고 생성한 키를 삭제합니다.

PR CI에는 peer·lint·FSD·포맷·타입·단위 테스트·빌드·Chromium 브라우저 검사를 연결했습니다. 원격 CI 통과 여부는 별도 확인 대상입니다. 구현 계획은 `docs/implementation-plan.md`, 로컬 실행 결과와 남은 출시 조건은 `docs/implementation-status.md`, 3D 단독 재현 절차와 캡처는 `src/entities/conch/qa/README.md`에 있습니다.

## Hermes Agent 하네스

프로젝트 규칙은 `AGENTS.md`, 저장소 전용 절차는 `.hermes/skills/`에 있습니다. 기존 `.claude` 설정을 유지합니다. 커밋·푸시·PR·배포는 각각 사용자 요청 범위에서만 수행합니다.

```sh
hermes skills trust "$(git rev-parse --show-toplevel)"
hermes
```
