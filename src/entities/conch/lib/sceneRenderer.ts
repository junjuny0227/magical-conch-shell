import {
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  Object3D,
  OrthographicCamera,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

import { createConchModel } from './conchModel';
import { createDemandLoop } from './demandLoop';
import { createPullState, MAX_PULL_DISTANCE, MAX_WORLD_PULL } from './pullState';

// 화면 방향을 모델 로컬 방향으로 변환하고, 고리/줄 끝만 뷰포트 안에 제한한다.
// 카메라를 뒤로 빼거나 배율을 줄이지 않아 본체 크기는 그대로 유지된다.
export const getSafePullOffset = (
  delta: Vector2,
  distance: number,
  camera: OrthographicCamera,
  root: Object3D,
  restingBounds: Box3,
) => {
  if (delta.lengthSq() === 0) return new Vector3();
  const world = new Vector3(delta.x, -delta.y, 0)
    .normalize()
    .applyQuaternion(camera.quaternion)
    .multiplyScalar(Math.min(1, Math.max(0, distance) / MAX_PULL_DISTANCE) * MAX_WORLD_PULL);
  const min = new Vector2(Infinity, Infinity);
  const max = new Vector2(-Infinity, -Infinity);
  for (const x of [restingBounds.min.x, restingBounds.max.x])
    for (const y of [restingBounds.min.y, restingBounds.max.y])
      for (const z of [restingBounds.min.z, restingBounds.max.z]) {
        const point = new Vector3(x, y, z).project(camera);
        min.min(new Vector2(point.x, point.y));
        max.max(new Vector2(point.x, point.y));
      }
  const projected = world.clone().project(camera).sub(new Vector3().project(camera));
  let scale = 1;
  for (const axis of ['x', 'y'] as const) {
    const shift = projected[axis];
    if (shift > 0) scale = Math.min(scale, (0.96 - max[axis]) / shift);
    if (shift < 0) scale = Math.min(scale, (-0.96 - min[axis]) / shift);
  }
  return world
    .multiplyScalar(Math.max(0, scale))
    .applyQuaternion(root.getWorldQuaternion(new Quaternion()).invert());
};

interface SceneOptionsType {
  getState: () => { disabled: boolean; onPull?: () => void };
  onReady: () => void;
  onFailure: () => void;
}

export const createConchScene = (canvas: HTMLCanvasElement, options: SceneOptionsType) => {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new Scene();
  const camera = new OrthographicCamera(-2.3, 2.3, 2.3, -2.3, 0.1, 20);
  camera.position.set(0.05, 0.1, 7);
  camera.lookAt(-0.12, -0.12, 0);
  const model = createConchModel();
  model.root.rotation.y = -0.1;
  model.root.rotation.z = 0.025;
  scene.add(model.root);
  scene.add(new HemisphereLight(new Color('#fff1f2'), new Color('#547baa'), 2.25));
  const key = new DirectionalLight('#fff0e4', 3.1);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const fill = new DirectionalLight('#8cdbec', 1.4);
  fill.position.set(4, -1, 3);
  scene.add(fill);
  const back = new DirectionalLight('#d3b8f5', 1.2);
  back.position.set(-3, 1, -4);
  scene.add(back);
  const ray = new Raycaster();
  const pointer = new Vector2();
  const pull = createPullState();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let dead = false;
  let activePointer: number | null = null;
  let width = 1;
  let height = 1;
  let startX = 0;
  let startY = 0;
  let restingBounds = new Box3();
  let offset = new Vector3();
  let returnStart = 0;
  let returnOffset: Vector3 | null = null;
  let ready = false;

  const loop = createDemandLoop(
    () => {
      if (dead) return false;
      if (reducedMotion.matches && returnOffset) {
        offset.set(0, 0, 0);
        returnOffset = null;
      }
      if (returnOffset) {
        const progress = Math.min(1, (performance.now() - returnStart) / 240);
        offset.copy(returnOffset).multiplyScalar(Math.pow(1 - progress, 3));
        if (progress === 1) returnOffset = null;
      }
      model.setPull(offset);
      try {
        renderer.render(scene, camera);
        if (!ready) {
          ready = true;
          options.onReady();
        }
      } catch {
        fail();
        return false;
      }
      return returnOffset !== null;
    },
    requestAnimationFrame,
    cancelAnimationFrame,
  );

  const reset = () => {
    pull.cancel();
    if (activePointer !== null && canvas.hasPointerCapture(activePointer))
      canvas.releasePointerCapture(activePointer);
    activePointer = null;
    if (reducedMotion.matches || document.hidden || offset.lengthSq() < 0.000001) {
      offset.set(0, 0, 0);
      returnOffset = null;
    } else {
      returnOffset = offset.clone();
      returnStart = performance.now();
    }
    canvas.style.cursor = options.getState().disabled ? 'default' : 'grab';
    loop.invalidate();
  };
  const resize = () => {
    if (dead) return;
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, box.width);
    height = Math.max(1, box.height);
    const viewHeight = Math.max(4.6, 4.6 / (width / height));
    const viewWidth = (viewHeight * width) / height;
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    model.setPull(new Vector3());
    model.root.updateMatrixWorld(true);
    // 0.08 여유에는 고리 아래의 줄 끝/손잡이 두께도 포함한다.
    restingBounds = new Box3().setFromObject(model.ring).expandByScalar(0.08);
    model.setPull(offset);
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    loop.invalidate();
  };
  const hitRing = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - box.left) / width) * 2 - 1,
      (-(event.clientY - box.top) / height) * 2 + 1,
    );
    model.root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    ray.setFromCamera(pointer, camera);
    return ray.intersectObject(model.ring, true).length > 0;
  };
  const down = (event: PointerEvent) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      !pull.begin(
        event.pointerId,
        event.clientX,
        event.clientY,
        hitRing(event),
        options.getState().disabled,
      )
    )
      return;
    event.preventDefault();
    activePointer = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    returnOffset = null;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      reset();
      return;
    }
    canvas.style.cursor = 'grabbing';
  };
  const move = (event: PointerEvent) => {
    if (activePointer !== event.pointerId) {
      if (activePointer === null && event.pointerType === 'mouse')
        canvas.style.cursor = !options.getState().disabled && hitRing(event) ? 'grab' : 'default';
      return;
    }
    if (options.getState().disabled) {
      reset();
      return;
    }
    const distance = pull.move(event.pointerId, event.clientX, event.clientY);
    offset = getSafePullOffset(
      new Vector2(event.clientX - startX, event.clientY - startY),
      distance,
      camera,
      model.root,
      restingBounds,
    );
    if (reducedMotion.matches) offset.multiplyScalar(0.12);
    loop.invalidate();
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    pull.move(event.pointerId, event.clientX, event.clientY);
    const shouldPull = pull.release(event.pointerId, options.getState().disabled);
    reset();
    if (shouldPull && !options.getState().disabled) options.getState().onPull?.();
  };
  const cancel = (event: PointerEvent) => {
    if (event.pointerId === activePointer) reset();
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      reset();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!pull.beginKeyboard(event.key, event.repeat, options.getState().disabled)) return;
    returnOffset = null;
    offset = getSafePullOffset(
      new Vector2(1, 0),
      MAX_PULL_DISTANCE,
      camera,
      model.root,
      restingBounds,
    );
    if (reducedMotion.matches) offset.multiplyScalar(0.12);
    loop.invalidate();
  };
  const keyup = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!pull.releaseKeyboard(event.key, options.getState().disabled)) return;
    reset();
    if (!options.getState().disabled) options.getState().onPull?.();
  };
  const visibility = () => {
    if (document.hidden) reset();
    loop.setVisible(!document.hidden);
  };
  const motion = () => {
    if (reducedMotion.matches) {
      offset.set(0, 0, 0);
      returnOffset = null;
      loop.invalidate();
    }
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    fail();
  };
  const observer = new ResizeObserver(resize);
  const destroy = () => {
    if (dead) return;
    dead = true;
    pull.cancel();
    loop.destroy();
    observer.disconnect();
    if (activePointer !== null && canvas.hasPointerCapture(activePointer))
      canvas.releasePointerCapture(activePointer);
    activePointer = null;
    canvas.removeEventListener('keydown', keydown);
    canvas.removeEventListener('keyup', keyup);
    canvas.removeEventListener('blur', reset);
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', cancel);
    canvas.removeEventListener('lostpointercapture', cancel);
    canvas.removeEventListener('webglcontextlost', contextLost);
    document.removeEventListener('visibilitychange', visibility);
    reducedMotion.removeEventListener('change', motion);
    model.dispose();
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
  };
  const fail = () => {
    if (dead) return;
    destroy();
    options.onFailure();
  };
  canvas.addEventListener('keydown', keydown);
  canvas.addEventListener('keyup', keyup);
  canvas.addEventListener('blur', reset);
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', cancel);
  canvas.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', visibility);
  reducedMotion.addEventListener('change', motion);
  try {
    observer.observe(canvas);
    resize();
    loop.setVisible(!document.hidden);
  } catch (error) {
    destroy();
    throw error;
  }
  return {
    destroy,
    syncState() {
      if (options.getState().disabled) reset();
    },
  };
};
