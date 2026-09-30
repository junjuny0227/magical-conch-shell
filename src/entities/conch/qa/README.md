# 소라고동 장면 검증

## 공개 API

`@/entities/conch`는 `CONCH_ANSWERS`, `ConchAnswerIdType`, `ConchScene`을 공개한다.

`ConchScene`의 props는 `disabled?: boolean`, `onPull?: () => void`, `className?: string`이다. 부모가 높이를 예약하고 질문 검증·로그인·요청 중 상태를 `disabled`로 전달한다. 키보드 실행 버튼은 부모가 제공한다. 고리 표면에서 시작한 현재 화면 거리 48px 이상 당기기를 놓을 때만 콜백을 실행한다. 최대 시각 이동은 0.65 장면 단위다.

Three.js와 장면 모듈은 클라이언트 effect 안에서 지연 로드한다. 정적인 동안 RAF를 반복하지 않으며 복귀에만 최대 240ms를 사용한다. DPR은 1.5 이하이고 숨겨진 문서에서는 렌더 예약을 취소한다. 초기화·컨텍스트 실패에는 캔버스 대신 직접 제작한 SVG를 표시한다. SVG와 3D는 동시에 표시하지 않는다.

## 재현

```sh
pnpm test src/entities/conch
node src/entities/conch/qa/serve.cjs
# 다른 터미널
node src/entities/conch/qa/verify.cjs
```

단독 하니스는 실제 WebGL 장면만 실행한다. 앱 로그인·서버 응답을 모의하거나 인증을 우회하지 않는다. `window.sceneTest`는 이 검증 서버 HTML 안에만 있으며 제품 모듈에는 전역 디버그 상태가 없다.

## 관측 결과

- Vitest 4개 파일, 5개 테스트 통과. 본체·입술·내벽·스피커·나선의 유한 좌표·노멀·바운딩, 실제 raycast의 열린 입구와 뒤쪽 스피커, 고리 이동·해제, 제출 문턱·취소·중복·비활성화, demand RAF 취소를 검사했다. 구현 전 실패를 확인한 후 구현했다.
- 장면 단독 Chromium에서 고리 raycast 지점 `(405, 81)`을 실제 포인터 커서로 찾았다. 75px 당기기 한 번에 콜백 정확히 1회, 짧은 당기기·몸통 시작·pointercancel·진행 중 비활성화는 추가 제출 0회였다.
- 컨텍스트 손실 후 실패 콜백과 캔버스 제거, 중복 destroy 호출, 375×360 reduced-motion 렌더를 확인했다. 브라우저 pageerror 0개.
- CSS 600×460, 기기 DPR 2에서 실제 backing store는 900×690으로 제한됐다.
- 정지와 복귀 캡처의 SHA-256이 같아 실제 고리·줄이 정확히 원위치로 복귀했다. 당기는 프레임은 다른 해시다.
- 상단의 끊어진 나선 튜브를 연속 원뿔형 나선 곡면으로 교체했다. 몸통과 내벽을 입술의 바깥/안쪽 경계에 연결해 표면 중첩을 줄였다. 입구로 돌출되던 나선은 스피커보다 뒤로 이동했다.
- 범위 ESLint, Prettier, 전체 `tsc --noEmit` 통과. 전체 제품 빌드·로그인·키보드 경로·SVG 실제 표시의 통합 검증은 부모 작업에서 수행한다.

## 최종 캡처

`qa/evidence/`의 캡처는 단독 실제 장면이며 앱 전체 페이지 캡처가 아니다.

| 파일               | SHA-256                                                          |
| ------------------ | ---------------------------------------------------------------- |
| desktop-idle.png   | bc40ffa9ed74830a1e3eddb98bb332161166534250eb935dedd0fd21d5174733 |
| desktop-pull.png   | 969779b40694965db39f49785be7df16b28d5ed6355b563ba712627c2dc038b9 |
| desktop-return.png | bc40ffa9ed74830a1e3eddb98bb332161166534250eb935dedd0fd21d5174733 |
| mobile-reduced.png | afd82d3b05ce39c4bb6f364b3b083646df7d70eb7402a602478a862d3bd880c3 |
