import { Box3, OrthographicCamera, Vector2, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConchModel } from './conchModel';
import { createConchScene, getSafePullOffset } from './sceneRenderer';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: class {
      setClearColor() {}
      setPixelRatio() {}
      setSize() {}
      render() {}
      dispose() {}
      forceContextLoss() {}
    },
  };
});

afterEach(() => vi.unstubAllGlobals());

const fixture = (width: number, height: number) => {
  const model = createConchModel();
  model.root.rotation.set(0, -0.1, 0.025);
  model.root.updateMatrixWorld(true);
  const viewHeight = Math.max(4.6, (4.6 * height) / width);
  const viewWidth = (viewHeight * width) / height;
  const camera = new OrthographicCamera(
    -viewWidth / 2,
    viewWidth / 2,
    viewHeight / 2,
    -viewHeight / 2,
    0.1,
    20,
  );
  camera.position.set(0.05, 0.1, 7);
  camera.lookAt(-0.12, -0.12, 0);
  camera.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model.ring).expandByScalar(0.08);
  return { model, camera, bounds };
};

describe('Canvas 고리 키보드 연결', () => {
  it('Enter/Space·repeat·blur·disabled를 처리하고 클릭으로 제출하지 않는다', () => {
    const documentTarget = Object.assign(new EventTarget(), { hidden: false });
    const media = Object.assign(new EventTarget(), { matches: true });
    vi.stubGlobal('document', documentTarget);
    vi.stubGlobal('window', { devicePixelRatio: 1, matchMedia: () => media });
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const canvas = Object.assign(new EventTarget(), {
      style: { cursor: '' },
      getBoundingClientRect: () => ({ width: 900, height: 560 }),
      hasPointerCapture: () => false,
    }) as unknown as HTMLCanvasElement;
    const onPull = vi.fn();
    let disabled = false;
    const controller = createConchScene(canvas, {
      getState: () => ({ disabled, onPull }),
      onReady: vi.fn(),
      onFailure: vi.fn(),
    });
    const key = (type: string, value: string, repeat = false) => {
      const event = Object.assign(new Event(type, { cancelable: true }), { key: value, repeat });
      canvas.dispatchEvent(event);
      return event;
    };
    canvas.dispatchEvent(new Event('click'));
    expect(onPull).not.toHaveBeenCalled();
    expect(key('keydown', 'Enter').defaultPrevented).toBe(true);
    key('keydown', 'Enter', true);
    expect(onPull).not.toHaveBeenCalled();
    key('keyup', 'Enter');
    key('keyup', 'Enter');
    expect(onPull).toHaveBeenCalledTimes(1);
    key('keydown', ' ');
    key('keyup', ' ');
    expect(onPull).toHaveBeenCalledTimes(2);
    key('keydown', 'Enter');
    canvas.dispatchEvent(new Event('blur'));
    key('keyup', 'Enter');
    expect(onPull).toHaveBeenCalledTimes(2);
    key('keydown', 'Enter');
    disabled = true;
    controller.syncState();
    key('keyup', 'Enter');
    key('keydown', ' ');
    key('keyup', ' ');
    expect(onPull).toHaveBeenCalledTimes(2);
    controller.destroy();
    disabled = false;
    key('keydown', 'Enter');
    key('keyup', 'Enter');
    expect(onPull).toHaveBeenCalledTimes(2);
  });
});

describe('당김 투영과 뷰포트 안전 범위', () => {
  it('데스크톱 가로 최대 당김은 1.625이며 카메라 배율은 변경하지 않는다', () => {
    const { model, camera, bounds } = fixture(900, 560);
    const before = camera.projectionMatrix.clone();
    const offset = getSafePullOffset(new Vector2(225, 0), 225, camera, model.root, bounds);
    expect(offset.length()).toBeCloseTo(1.625);
    expect(camera.projectionMatrix.equals(before)).toBe(true);
    expect(
      getSafePullOffset(new Vector2(90, 0), 90, camera, model.root, bounds).length(),
    ).toBeCloseTo(0.65);
    model.dispose();
  });
  it.each([
    [375, 340],
    [343, 280],
    [375, 430],
    [900, 560],
  ])('%ipx × %ipx에서 최대 당김 고리와 줄 끝이 잘리지 않는다', (width, height) => {
    const { model, camera, bounds } = fixture(width, height);
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
      const delta = new Vector2(Math.cos(angle), Math.sin(angle)).multiplyScalar(500);
      const offset = getSafePullOffset(delta, 225, camera, model.root, bounds);
      expect(offset.length()).toBeLessThanOrEqual(1.625 + 1e-9);
      model.setPull(offset);
      model.root.updateMatrixWorld(true);
      const moved = new Box3().setFromObject(model.root);
      for (const x of [moved.min.x, moved.max.x])
        for (const y of [moved.min.y, moved.max.y])
          for (const z of [moved.min.z, moved.max.z]) {
            const projected = new Vector3(x, y, z).project(camera);
            expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.96 + 1e-9);
            expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.96 + 1e-9);
          }
    }
    expect(getSafePullOffset(new Vector2(), 0, camera, model.root, bounds).length()).toBe(0);
    model.dispose();
  });
});
