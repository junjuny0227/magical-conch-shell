import { describe, expect, it } from 'vitest';

import { createConchGeometry } from './geometry';

describe('직접 제작한 열린 소라고동', () => {
  it('모든 메시의 좌표와 노멀이 유한하고 입구가 실제로 열린다', () => {
    const parts = createConchGeometry();
    for (const geometry of Object.values(parts)) {
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      expect(position.count).toBeGreaterThan(30);
      expect(normal.count).toBe(position.count);
      for (const attribute of [position, normal]) {
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      }
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      expect(box.min.x).toBeGreaterThan(-3);
      expect(box.max.x).toBeLessThan(3);
      expect(box.min.y).toBeGreaterThan(-3);
      expect(box.max.y).toBeLessThan(3);
    }
    // 본체와 말린 입술은 열린 경계를 유지하며 스피커는 뒤에 별도로 놓인다.
    // 몸통은 입술 중심선과 겹치지 않고 바깥쪽 경계에서 이어진다.
    const firstBody = parts.body.getAttribute('position');
    const firstRim = parts.rim.getAttribute('position');
    expect(Math.abs(firstBody.getX(0) - firstRim.getX(0))).toBeLessThan(0.025);
    expect(Math.abs(firstBody.getY(0) - firstRim.getY(0))).toBeLessThan(0.025);
    expect(parts.body.userData.openAperture).toBe(true);
    expect(parts.rim.userData.openAperture).toBe(true);
    expect(parts.speaker.boundingBox!.max.z).toBeLessThan(0);
    expect(parts.body.boundingBox!.min.x).toBeLessThan(-1);
    expect(parts.rim.boundingBox!.min.y).toBeLessThan(-1.5);
    const spiralPosition = parts.spiral.getAttribute('position');
    const apexXs = Array.from({ length: 21 }, (_, i) => spiralPosition.getX(i * 201));
    expect(Math.max(...apexXs) - Math.min(...apexXs)).toBeLessThan(0.055);
    const apexYs = Array.from({ length: 21 }, (_, i) => spiralPosition.getY(i * 201));
    expect(Math.max(...apexYs) - Math.min(...apexYs)).toBeLessThan(0.055);
    Object.values(parts).forEach((geometry) => geometry.dispose());
  });
});
