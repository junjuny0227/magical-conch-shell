# 구현 상태와 로컬 검증

기준: 2026-10-01. 구현 계획은 `docs/implementation-plan.md`에 보존한다. 아래 기록은 부모 에이전트가 이 checkout에서 직접 실행한 결과이며, 외부 서비스 실연동·원격 CI·배포 완료를 뜻하지 않는다.

## 판정

- **로컬 구현 검증 통과:** 인증·자격·세션, 질문 API·Jeb 응답 파싱, Redis 예약 경계, 직접 제작한 3D·질문 화면의 자동 검사.
- **출시 보류:** 실제 등록된 DataGSM client/학생·교사 계정, 관리형 Redis, Jeb 키로 앱의 end-to-end 경로를 아직 검증하지 않았다. 외부 서비스 생성·비용·배포 승인도 필요하다.
- 실제 비밀 파일을 열거나 변경하지 않았다. `.env.example`에는 placeholder만 있다. 개발 커밋은 로컬이며 푸시하지 않았다.

## 실행 결과

출처는 모두 이 checkout의 로컬 실행이다. 마지막 전체 검사는 **2026-10-01 01:30:29 KST**에 종료했고, 이후 이 기록 등 문서 정리만 진행했다. 커밋 hook은 ESLint·Prettier를 실행한다.

| 명령                                                                                 | 종료 코드 | 관측 결과와 범위                                                           |
| ------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------- |
| `pnpm peers check`                                                                   | 0         | peer dependency 문제 없음                                                  |
| `pnpm lint`                                                                          | 0         | 저장소 전체 ESLint 통과                                                    |
| `pnpm lint:fsd`                                                                      | 0         | 자체 의존성 검사·Steiger 통과                                              |
| `pnpm format:check`                                                                  | 0         | 전체 포맷 통과                                                             |
| `API_BASE_URL=http://localhost:8080 pnpm check-types`                                | 0         | Next route typegen·TypeScript 통과                                         |
| `API_BASE_URL=http://localhost:8080 pnpm build`                                      | 0         | production build 성공, 홈·로그인·인증 4개 API·질문 API 생성                |
| `NODE_ENV=test pnpm test`                                                            | 0         | 140개 통과, 실제 Redis 테스트 4개 skip                                     |
| `NODE_ENV=test CONCH_CAPTURE_DIR=/Users/junjuny/.hermes/cache/scratch pnpm test:e2e` | 0         | Chromium 8개 통과                                                          |
| `node src/entities/conch/qa/verify.cjs`                                              | 0         | 단독 WebGL 실제 포인터·복귀·취소·disabled·context-loss·reduced-motion 확인 |
| `shasum -a 256 src/entities/conch/qa/evidence/*.png`                                 | 0         | 정지·복귀 해시 동일, 당김 프레임은 다름; QA README 해시와 일치             |
| `git diff --check`                                                                   | 0         | 변경 diff 공백 오류 없음                                                   |

Vitest는 `vitest.config.ts`의 ESM/CommonJS 로딩에 관한 향후 Vite 호환성 경고를 출력한다. 현재 실행 실패는 아니다. GitHub Actions에는 단위 검사와 Chromium 설치·브라우저 검사 단계를 연결했지만 **원격 CI 실행 결과는 없다**. 별도 외부 보안 스캐너·침투 테스트·모바일 실기기 검사는 실행하지 않았다.

## 요구별 증거와 제한

다음 ID는 이 상태 기록에서 부여한 로컬 검증 항목이며 원 계획의 공식 요구 ID가 아니다. 파일 매핑은 구현 소유권을 기준으로 한다.

| 항목                                           | 구현 단위                                                        | 직접 확인한 증거와 남은 조건                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| FR-001 재학생·승인 완료 교사와 1시간 세션      | `entities/account`, `features/auth`, `app/api/auth`              | 자격 allow/deny, PKCE/state, 거래 일회성·만료, 세션 만료·로그아웃·Origin 단위/라우트 검사. **실제 학생·교사 로그인 미검증** |
| FR-002 고정 대사와 오류 분리                   | `features/ask-conch`, `app/api/conch/answer`                     | 성공·계약 밖 choice·깨진 응답·401/422/429/5xx·timeout·실패 저장 테스트. **앱에서 실제 Jeb 호출 미검증**                     |
| FR-003 공유 제한·중복 방지                     | `features/ask-conch/api/reservation.ts`                          | 예약 경계와 손상된 캐시·소유 토큰·모호한 결과 테스트. **실제 Redis Lua 경쟁 조건 4개 skip**                                 |
| FR-004 직접 제작 3D 고리와 키보드 대체         | `entities/conch`, `widgets/conch-playground`                     | 단독 actual raycast와 앱의 짧은/긴 당김·1회 제출 E2E, WebGL context-loss 뒤 SVG·키보드 제출 E2E                             |
| FR-005 반응형 한국어 화면                      | `views/home`, `views/login`, `app/globals.css`                   | 375/768/1440px 홈·로그인 렌더·가로 overflow E2E와 캡처 검토. 짧은 데스크톱에서 버튼 경로 확인, 모바일은 스크롤 허용         |
| FR-006 고위험 질문을 오락용 대사로 답하지 않음 | `features/ask-conch/model/safety.ts`, `api/handleConchAnswer.ts` | 명시적 자해·복약·폭행·금융 질문은 Redis 예약/Jeb 전에 거부하는 회귀 검사. **키워드 필터로 의미 기반 안전을 보증하지 않음**  |

3D 증거·재현은 `src/entities/conch/qa/README.md` 및 `qa/evidence/`에 있다. 앱 화면 캡처는 로컬 scratch의 `conch-home-{1440,768,375}.png`, `conch-login-{1440,768,375}.png`이다. 장면 단독 캡처와 앱 캡처, API fixture와 실연동을 구분한다.

## 출시 전에 남은 일

1. Redis 공급자·비용과 고정 배포 도메인을 확정하고 외부 서비스 설정을 승인한다. 운영 namespace는 개발값과 분리한다.
2. DataGSM client·callback·`datagsm:self_read`를 등록하고 실제 학생/교사 허용·졸업/자퇴/미승인 거부·새로고침·1시간 만료·로그아웃 후 쿠키 재사용 거부를 확인한다.
3. 전용 Redis에서 실제 Lua 경쟁 조건 테스트를 실행하고 관리형 REST 클라이언트의 세션·거래·예약·TTL 동작을 확인한다.
4. Jeb 제공자에게 선생님을 포함한 앱에서 키 공유가 허용되는지 확인한다. 실제 최소 호출로 choice 매핑·지연·허용량을 확인한다. 별도 키 사용처가 있으면 앱 한도만으로 공용 한도를 보증할 수 없다.
5. 모바일 실제 터치, 짧은 화면·긴 한국어, 접근성·WebGL 지원과 서버리스 함수 timeout을 배포 대상에서 확인한다. 키워드 필터의 안전 한계를 검토한다.
6. 별도 푸시·배포 승인 후 원격 CI와 배포된 로그인 → 질문 → 새로고침 → 로그아웃 흐름을 확인한다.

## 생성 파일 경계

- 잠금 파일은 의존성 설치로 갱신했다.
- `AGENTS.md`의 Next 에이전트 블록은 파일 안에 선언된 `node_modules/next/dist/server/lib/generate-agent-files.js`가 `next dev`에서 추가한 것이다. 수동 번역·삭제하지 않는다.
- 그 외 생성 산출물의 저장소 선언형 매핑은 `map_not_declared`다. `.next`·브라우저 trace/report는 커밋 대상에서 제외한다.
