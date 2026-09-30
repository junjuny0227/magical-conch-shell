import { useId } from 'react';

// 직접 그린 정적 대체 표현. WebGL 실패 때만 표시하며 3D 준비 화면과 겹치지 않는다.
const ConchFallback = () => {
  const id = useId().replaceAll(':', '');
  return (
    <svg
      data-testid="conch-fallback"
      role="img"
      aria-label="3D를 사용할 수 없어 표시한 정적 소라고동. 옆의 버튼으로 질문할 수 있습니다."
      viewBox="0 0 600 600"
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#efdbef" />
          <stop offset=".5" stopColor="#b8a8e4" />
          <stop offset="1" stopColor="#708bc5" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" x2="1">
          <stop stopColor="#b5a9df" />
          <stop offset=".55" stopColor="#f0dcec" />
          <stop offset="1" stopColor="#9da3d8" />
        </linearGradient>
        <pattern
          id={`${id}-grille`}
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-35)"
        >
          <rect width="12" height="12" fill="#062d3c" />
          <path d="M0 0h12M0 0v12" stroke="#298397" strokeWidth="3" />
        </pattern>
      </defs>
      <g
        transform="translate(35 35) scale(.88)"
        stroke="#668dae"
        strokeWidth="3"
        strokeLinejoin="round"
      >
        <path
          d="M58 73Q33 21 83 45Q109 39 135 57Q169 41 214 63Q263 44 299 83Q366 70 400 118Q425 149 397 177Q434 217 451 233Q483 239 482 271Q477 290 460 303Q462 378 443 443Q443 477 472 510L523 563Q541 587 516 579L441 523Q418 500 372 498Q250 496 174 458Q105 424 109 333Q63 314 79 265Q38 215 69 171Q27 126 58 73Z"
          fill={`url(#${id}-shell)`}
        />
        <path
          d="M61 83Q86 52 132 61M65 164Q100 78 215 67M80 247Q119 114 296 88"
          fill="none"
          stroke="#8298cb"
          strokeWidth="14"
        />
        <path
          d="M278 188Q321 161 359 207Q417 247 419 302L406 394Q397 449 437 498Q372 459 320 439Q253 421 231 360Q206 293 241 228Z"
          fill={`url(#${id}-grille)`}
        />
        <path
          d="M375 137Q292 102 224 190Q165 269 185 356Q201 431 320 464Q386 481 446 514Q394 466 406 395L420 307Q425 253 385 219"
          fill="none"
          stroke={`url(#${id}-rim)`}
          strokeWidth="52"
          strokeLinecap="round"
        />
        <ellipse cx="450" cy="239" rx="29" ry="22" fill="#a5a4d9" />
        <path
          d="M458 216L469 191"
          fill="none"
          stroke="#e3f5dd"
          strokeWidth="19"
          strokeLinecap="round"
        />
        <circle cx="479" cy="169" r="30" fill="#e3f5dd" />
        <circle cx="479" cy="169" r="14" fill="#e7f7f5" />
      </g>
    </svg>
  );
};
export default ConchFallback;
