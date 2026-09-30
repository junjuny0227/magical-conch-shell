import { describe, expect, it, vi } from 'vitest';

import { createDemandLoop } from './demandLoop';

describe('필요할 때만 그리는 루프', () => {
  it('중복 프레임을 합치고 숨김과 해제 시 예약을 취소한다', () => {
    let frame: (() => void) | undefined;
    const request = vi.fn((fn: () => void) => {
      frame = fn;
      return 1;
    });
    const cancel = vi.fn();
    const render = vi.fn(() => false);
    const loop = createDemandLoop(render, request, cancel);
    loop.invalidate();
    loop.invalidate();
    expect(request).toHaveBeenCalledTimes(1);
    frame!();
    expect(render).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    loop.invalidate();
    loop.setVisible(false);
    expect(cancel).toHaveBeenCalledWith(1);
    loop.invalidate();
    expect(request).toHaveBeenCalledTimes(2);
    loop.setVisible(true);
    expect(request).toHaveBeenCalledTimes(3);
    loop.destroy();
    frame!();
    expect(render).toHaveBeenCalledTimes(1);
    loop.invalidate();
    expect(request).toHaveBeenCalledTimes(3);
  });
});
