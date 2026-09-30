import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { createConchModel } from './conchModel';

describe('소라고동 입구와 고리', () => {
  it('입구 중심에는 껍질이 없고 뒤로 들어간 스피커가 보인다', () => {
    const model = createConchModel();
    model.root.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0.05, -0.25, 3), new Vector3(0, 0, -1));
    const first = ray.intersectObjects(model.root.children, true)[0];
    expect(first.object.name).toBe('speaker');
    expect(first.point.z).toBeLessThan(0);
    expect(model.ring.name).toBe('pull-ring');
    model.setPull(new Vector3(0.4, 0.3, 0));
    expect(model.ring.position.x).toBeCloseTo(1.49);
    expect(new Box3().setFromObject(model.root).max.x).toBeLessThan(2.2);
    const geometries = new Set();
    const materials = new Set();
    model.root.traverse((object) => {
      if (object instanceof Mesh) {
        geometries.add(object.geometry);
        materials.add(object.material);
      }
    });
    expect(geometries.size).toBeGreaterThan(7);
    let disposed = 0;
    model.root.traverse((object) => {
      if (object instanceof Mesh) object.geometry.addEventListener('dispose', () => disposed++);
    });
    model.dispose();
    expect(disposed).toBeGreaterThan(7);
  });
});
