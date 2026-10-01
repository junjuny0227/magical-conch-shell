'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/shared/lib';

import ConchFallback from './ConchFallback';

export interface ConchSceneProps {
  disabled?: boolean;
  onPull?: () => void;
  className?: string;
}
interface SceneControllerType {
  destroy: () => void;
  syncState: () => void;
}

const ConchScene = ({ disabled = false, onPull, className }: ConchSceneProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<SceneControllerType | null>(null);
  const latestRef = useRef({ disabled, onPull });
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  useLayoutEffect(() => {
    latestRef.current = { disabled, onPull };
    controllerRef.current?.syncState();
  }, [disabled, onPull]);

  useEffect(() => {
    let stopped = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 이 경계 안에서만 Three.js 및 브라우저 렌더러를 불러온다.
    void import('../lib/sceneRenderer')
      .then(({ createConchScene }) => {
        if (stopped) return;
        try {
          controllerRef.current = createConchScene(canvas, {
            getState: () => latestRef.current,
            onReady: () => {
              if (!stopped) setStatus('ready');
            },
            onFailure: () => {
              if (!stopped) setStatus('failed');
            },
          });
        } catch {
          if (!stopped) setStatus('failed');
        }
      })
      .catch(() => {
        if (!stopped) setStatus('failed');
      });
    return () => {
      stopped = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  return (
    <div
      data-testid="conch-stage"
      data-scene-state={status}
      className={cn('relative h-full w-full', className)}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {status === 'failed' ? (
        <ConchFallback disabled={disabled} onPull={onPull} />
      ) : (
        <canvas
          ref={canvasRef}
          data-testid="conch-canvas"
          className="conch-ring-control"
          aria-label="소라고동 고리 당기기"
          aria-disabled={disabled || status !== 'ready'}
          tabIndex={disabled || status !== 'ready' ? -1 : 0}
          role="button"
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            background: 'transparent',
            touchAction: 'none',
            visibility: status === 'ready' ? 'visible' : 'hidden',
          }}
        />
      )}
      {status === 'loading' && (
        <p
          role="status"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: '#496965',
            margin: 0,
          }}
        >
          소라고동을 빚는 중…
        </p>
      )}
    </div>
  );
};
export default ConchScene;
