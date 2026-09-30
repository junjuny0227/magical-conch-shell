import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
  Vector3,
} from 'three';

// 실제 입구 경계. 긴 수관 끝과 왼쪽으로 말린 입술을 하나의 연속 곡면으로 만든다.
export const apertureCurve = new CatmullRomCurve3(
  [
    new Vector3(-0.52, 0.88, 0.3),
    new Vector3(0.16, 0.88, 0.3),
    new Vector3(0.71, 0.43, 0.3),
    new Vector3(0.78, -0.32, 0.3),
    new Vector3(0.8, -0.95, 0.3),
    new Vector3(1.39, -1.73, 0.2),
    new Vector3(0.44, -1.22, 0.3),
    new Vector3(-0.38, -0.91, 0.3),
    new Vector3(-0.8, -0.27, 0.3),
    new Vector3(-0.84, 0.39, 0.3),
  ],
  true,
  'centripetal',
);

const surface = (width: number, height: number, point: (u: number, v: number) => Vector3) => {
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= height; y++)
    for (let x = 0; x <= width; x++) {
      positions.push(...point(x / width, y / height).toArray());
      uv.push(x / width, y / height);
      if (x < width && y < height) {
        const a = y * (width + 1) + x;
        const b = a + width + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
};

const rimRadius = (p: Vector3) => 0.055 + 0.21 * Math.min(1, Math.max(0, (p.y + 1.73) / 0.95));

export const createConchGeometry = () => {
  const body = surface(128, 40, (u, v) => {
    const p = apertureCurve.getPoint(u);
    const tangent = apertureCurve.getTangent(u);
    const outward = new Vector3(-tangent.y, tangent.x, 0).normalize();
    p.addScaledVector(outward, rimRadius(p));
    // 입구 뒤의 부푼 몸통을 거쳐 뒤쪽 중심으로 닫는다. 정면에는 삼각형을 채우지 않는다.
    const angle = (v * Math.PI) / 2;
    const expand = Math.sin(v * Math.PI) * 0.9;
    const center = new Vector3(-0.58, 0.13, -1.2);
    const radial = Math.cos(angle) + Math.sin(v * Math.PI) * 0.32;
    const x = center.x + (p.x - center.x) * radial - expand * 0.6;
    const y = center.y + (p.y - center.y) * Math.cos(angle) + expand * 0.035;
    const z = p.z - 0.018 - Math.sin(angle) * 1.48;
    return new Vector3(x, y, z);
  });
  const rim = surface(128, 24, (u, v) => {
    const p = apertureCurve.getPoint(u);
    const tangent = apertureCurve.getTangent(u);
    const n = new Vector3(-tangent.y, tangent.x, 0).normalize();
    const r = rimRadius(p);
    const phase = v * Math.PI * 2;
    return p.addScaledVector(n, Math.cos(phase) * r).add(new Vector3(0, 0, Math.sin(phase) * r));
  });
  const interior = surface(128, 12, (u, v) => {
    const p = apertureCurve.getPoint(u);
    const tangent = apertureCurve.getTangent(u);
    const outward = new Vector3(-tangent.y, tangent.x, 0).normalize();
    p.addScaledVector(outward, -rimRadius(p));
    // 뒤로 들어가면서 조금 좁아지는 실제 안쪽 벽.
    return new Vector3(p.x * (1 - v * 0.075), p.y * (1 - v * 0.075), p.z - 0.015 - v * 0.55);
  });
  const speakerPoints = Array.from({ length: 128 }, (_, i) => {
    const p = apertureCurve.getPoint(i / 128);
    return new Vector2(p.x * 0.935, p.y * 0.935);
  });
  const speaker = new BufferGeometry();
  speaker.setAttribute(
    'position',
    new Float32BufferAttribute(
      speakerPoints.flatMap((p) => [p.x, p.y, -0.27]),
      3,
    ),
  );
  speaker.setAttribute(
    'uv',
    new Float32BufferAttribute(
      speakerPoints.flatMap((p) => [(p.x + 1) / 2.5, (p.y + 1.8) / 2.8]),
      2,
    ),
  );
  speaker.setIndex(ShapeUtils.triangulateShape(speakerPoints, []).flat());
  speaker.computeVertexNormals();
  speaker.computeBoundingBox();

  // 한 장의 원뿔형 나선 껍질: 감기는 골을 전체 곡면에 새긴다.
  // 빈 공간이 생기는 튜브나 토러스 더미가 아니라 끝에서 몸통으로 연속 팽창한다.
  const spiral = surface(200, 20, (u, v) => {
    const theta = v * Math.PI * 2;
    const phase = u * Math.PI * 6.8 - theta;
    const groove = Math.pow((1 + Math.cos(phase)) / 2, 8);
    const radius = (0.021 + Math.pow(u, 0.84) * 0.88) * (1 - 0.13 * groove);
    const n = radius * Math.cos(theta);
    return new Vector3(
      -1.6 + u * 1.14 + n * 0.72,
      1.44 - u * 0.7 + n * 0.69 - Math.pow(Math.max(0, (u - 0.7) / 0.3), 2) * 0.38,
      -1.12 + radius * Math.sin(theta) * 0.79,
    );
  });
  body.userData.openAperture = true;
  rim.userData.openAperture = true;
  return { body, rim, interior, speaker, spiral };
};
