'use client';

import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';

import { createPullState, MAX_PULL_DISTANCE, MAX_WORLD_PULL } from '../lib/pullState';

interface ConchFallbackProps {
  disabled?: boolean;
  onPull?: () => void;
}

// WebGL 실패에도 같은 고리를 직접 당기거나 키보드로 조작한다.
const ConchFallback = ({ disabled = false, onPull }: ConchFallbackProps) => {
  const id = useId().replaceAll(':', '');
  const cordRef = useRef<SVGPathElement>(null);
  const ringRef = useRef<SVGGElement>(null);
  const pullRef = useRef(createPullState());
  const pointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const reducedMotion = useRef(false);

  const setOffset = useCallback(
    (x: number, y: number, dragging: boolean) => {
      const ring = ringRef.current;
      if (!ring) return;
      ring.style.transition =
        dragging || reducedMotion.current ? 'none' : 'transform 240ms cubic-bezier(0, 0, .2, 1)';
      ring.style.transform = `translate(${x}px, ${y}px)`;
      ring.style.cursor = disabled ? 'default' : dragging ? 'grabbing' : 'grab';
      cordRef.current?.setAttribute('d', `M458 216L${469 + x} ${191 + y}`);
    },
    [disabled],
  );

  const reset = useCallback(() => {
    pullRef.current.cancel();
    const pointer = pointerRef.current;
    pointerRef.current = null;
    if (pointer && ringRef.current?.hasPointerCapture(pointer.id))
      ringRef.current.releasePointerCapture(pointer.id);
    setOffset(0, 0, false);
  }, [setOffset]);
  const setVisualPull = (dx: number, dy: number, distance: number) => {
    const length = Math.hypot(dx, dy);
    if (length === 0) return setOffset(0, 0, true);
    const visual = (distance / MAX_PULL_DISTANCE) * MAX_WORLD_PULL * (600 / 4.6);
    let x = (dx / length) * visual;
    let y = (dy / length) * visual;
    // SVG 본체의 크기는 유지하고 고리 외곽/줄 끝을 viewBox 안에 둔다.
    const minX = (12 - 35) / 0.88 - 479 + 33;
    const maxX = (588 - 35) / 0.88 - 479 - 33;
    const minY = (12 - 35) / 0.88 - 169 + 33;
    const maxY = (588 - 35) / 0.88 - 169 - 60;
    let scale = 1;
    if (x > 0) scale = Math.min(scale, maxX / x);
    if (x < 0) scale = Math.min(scale, minX / x);
    if (y > 0) scale = Math.min(scale, maxY / y);
    if (y < 0) scale = Math.min(scale, minY / y);
    x *= Math.max(0, scale) * (reducedMotion.current ? 0.12 : 1);
    y *= Math.max(0, scale) * (reducedMotion.current ? 0.12 : 1);
    setOffset(x, y, true);
  };
  const down = (event: PointerEvent<SVGGElement>) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      !pullRef.current.begin(event.pointerId, event.clientX, event.clientY, true, disabled)
    )
      return;
    event.preventDefault();
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      reset();
      return;
    }
    setOffset(0, 0, true);
  };
  const move = (event: PointerEvent<SVGGElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (disabled) return reset();
    const distance = pullRef.current.move(event.pointerId, event.clientX, event.clientY);
    setVisualPull(event.clientX - pointer.x, event.clientY - pointer.y, distance);
  };
  const up = (event: PointerEvent<SVGGElement>) => {
    if (pointerRef.current?.id !== event.pointerId) return;
    pullRef.current.move(event.pointerId, event.clientX, event.clientY);
    const submit = pullRef.current.release(event.pointerId, disabled);
    reset();
    if (submit && !disabled) onPull?.();
  };
  const cancel = (event: PointerEvent<SVGGElement>) => {
    if (pointerRef.current?.id === event.pointerId) reset();
  };
  const keydown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Escape') return reset();
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!pullRef.current.beginKeyboard(event.key, event.repeat, disabled)) return;
    setOffset(0, 0, true);
    setVisualPull(1, 0, MAX_PULL_DISTANCE);
  };
  const keyup = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!pullRef.current.releaseKeyboard(event.key, disabled)) return;
    reset();
    if (!disabled) onPull?.();
  };

  useLayoutEffect(() => {
    if (disabled) reset();
  }, [disabled, reset]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pull = pullRef.current;
    const ring = ringRef.current;
    const motion = () => {
      reducedMotion.current = media.matches;
      if (media.matches) reset();
    };
    const visibility = () => {
      if (document.hidden) reset();
    };
    motion();
    media.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      media.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility);
      pull.cancel();
      const pointer = pointerRef.current;
      pointerRef.current = null;
      if (pointer && ring?.hasPointerCapture(pointer.id)) ring.releasePointerCapture(pointer.id);
    };
  }, [reset]);
  return (
    <svg
      data-testid="conch-fallback"
      role="group"
      aria-label="소라고동"
      viewBox="0 0 600 600"
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
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
          ref={cordRef}
          d="M458 216L469 191"
          fill="none"
          stroke="#f0eddc"
          strokeWidth="4"
          aria-hidden="true"
        />
        <g
          ref={ringRef}
          className="conch-ring-control"
          role="button"
          aria-label="소라고동 고리 당기기"
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onKeyDown={keydown}
          onKeyUp={keyup}
          onBlur={reset}
          style={{
            transform: 'translate(0px, 0px)',
            cursor: disabled ? 'default' : 'grab',
          }}
        >
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
      </g>
    </svg>
  );
};
export default ConchFallback;
