import {
  CircleGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RGBAFormat,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three';

import { createConchGeometry } from './geometry';

const grilleTexture = () => {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const wire = x % 8 < 2 || y % 8 < 2;
      const highlight = x % 8 === 0 || y % 8 === 0;
      const color = wire ? (highlight ? [53, 132, 147] : [25, 92, 111]) : [4, 28, 37];
      pixels.set([...color, 255], (y * size + x) * 4);
    }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

export const createConchModel = () => {
  const root = new Group();
  root.name = 'authored-conch';
  const geometries = createConchGeometry();
  const shellMaterial = new MeshStandardMaterial({
    color: '#b8a8e4',
    roughness: 0.78,
    metalness: 0,
    side: DoubleSide,
  });
  const rimMaterial = new MeshStandardMaterial({
    color: '#d6bfe9',
    roughness: 0.73,
    side: DoubleSide,
  });
  const innerMaterial = new MeshStandardMaterial({
    color: '#6c7eae',
    roughness: 0.86,
    side: DoubleSide,
  });
  const grille = grilleTexture();
  const speakerMaterial = new MeshStandardMaterial({
    map: grille,
    color: '#a8eff1',
    roughness: 0.94,
    side: DoubleSide,
  });
  for (const [name, geometry] of Object.entries(geometries)) {
    const material =
      name === 'rim'
        ? rimMaterial
        : name === 'interior'
          ? innerMaterial
          : name === 'speaker'
            ? speakerMaterial
            : shellMaterial;
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    root.add(mesh);
  }
  const pedestal = new Mesh(new SphereGeometry(0.26, 32, 24), shellMaterial);
  pedestal.scale.set(1, 0.85, 0.65);
  pedestal.position.set(0.95, 0.61, 0.25);
  pedestal.name = 'handle-socket';
  root.add(pedestal);
  const collar = new Mesh(new TorusGeometry(0.15, 0.048, 12, 36), innerMaterial);
  collar.position.set(1.04, 0.77, 0.39);
  collar.scale.y = 0.66;
  root.add(collar);
  const mint = new MeshStandardMaterial({ color: '#e3f5dd', roughness: 0.67, metalness: 0 });
  const ring = new Mesh(new TorusGeometry(0.205, 0.071, 20, 64), mint);
  const restingRing = new Vector3(1.09, 1.1, 0.39);
  ring.position.copy(restingRing);
  ring.name = 'pull-ring';
  // 시각적인 구멍은 유지하면서 중앙과 작은 외곽 여유도 잡을 수 있게 한다.
  const ringHitArea = new Mesh(
    new CircleGeometry(0.3, 48),
    new MeshBasicMaterial({ visible: false, side: DoubleSide }),
  );
  ringHitArea.name = 'pull-ring-hit-area';
  ring.add(ringHitArea);
  root.add(ring);
  const stem = new Mesh(new CylinderGeometry(0.069, 0.078, 0.22, 20), mint);
  stem.position.set(1.06, 0.87, 0.39);
  stem.rotation.z = -0.15;
  root.add(stem);
  const cord = new Mesh(
    new CylinderGeometry(0.016, 0.016, 1, 12),
    new MeshStandardMaterial({ color: '#f0eddc', roughness: 0.9 }),
  );
  root.add(cord);
  const anchor = new Vector3(1.035, 0.77, 0.39);
  const setPull = (offset: Vector3) => {
    ring.position.copy(restingRing).add(offset);
    stem.position.copy(ring.position).add(new Vector3(-0.03, -0.23, 0));
    const end = stem.position.clone().add(new Vector3(0, -0.1, 0));
    const delta = end.clone().sub(anchor);
    cord.position.copy(anchor).add(end).multiplyScalar(0.5);
    cord.scale.y = Math.max(0.001, delta.length());
    cord.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize());
    cord.visible = offset.lengthSq() > 0.0001;
  };
  setPull(new Vector3());
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const geometrySet = new Set();
    const materialSet = new Set<Material>();
    root.traverse((object) => {
      if (object instanceof Mesh) {
        if (!geometrySet.has(object.geometry)) {
          object.geometry.dispose();
          geometrySet.add(object.geometry);
        }
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          materialSet.add(material);
      }
    });
    materialSet.forEach((material) => material.dispose());
    grille.dispose();
    root.clear();
  };
  return { root, ring, setPull, dispose };
};
