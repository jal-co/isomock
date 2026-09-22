export type ToolcraftOrientationVector = readonly [number, number, number];

const epsilon = 1e-12;

export function addOrientationVectors(
  left: ToolcraftOrientationVector,
  right: ToolcraftOrientationVector,
): [number, number, number] {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

export function crossOrientationVectors(
  left: ToolcraftOrientationVector,
  right: ToolcraftOrientationVector,
): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

export function dotOrientationVectors(
  left: ToolcraftOrientationVector,
  right: ToolcraftOrientationVector,
): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export function getOrientationVectorLength(
  vector: ToolcraftOrientationVector,
): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

export function normalizeOrientationVector(
  vector: ToolcraftOrientationVector,
): [number, number, number] {
  const length = getOrientationVectorLength(vector);

  if (length <= epsilon) {
    return [0, 0, 0];
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

export function scaleOrientationVector(
  vector: ToolcraftOrientationVector,
  scale: number,
): [number, number, number] {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

export class ToolcraftOrientationQuaternion {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 1,
  ) {}

  clone(): ToolcraftOrientationQuaternion {
    return new ToolcraftOrientationQuaternion(this.x, this.y, this.z, this.w);
  }

  invert(): this {
    const lengthSquared =
      this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;

    if (lengthSquared <= epsilon) {
      this.x = 0;
      this.y = 0;
      this.z = 0;
      this.w = 1;
      return this;
    }

    this.x = -this.x / lengthSquared;
    this.y = -this.y / lengthSquared;
    this.z = -this.z / lengthSquared;
    this.w /= lengthSquared;
    return this;
  }

  length(): number {
    return Math.hypot(this.x, this.y, this.z, this.w);
  }

  multiply(other: ToolcraftOrientationQuaternion): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;

    this.x = w * other.x + x * other.w + y * other.z - z * other.y;
    this.y = w * other.y - x * other.z + y * other.w + z * other.x;
    this.z = w * other.z + x * other.y - y * other.x + z * other.w;
    this.w = w * other.w - x * other.x - y * other.y - z * other.z;
    return this;
  }

  normalize(): this {
    const length = this.length();

    if (length <= epsilon) {
      this.x = 0;
      this.y = 0;
      this.z = 0;
      this.w = 1;
      return this;
    }

    this.x /= length;
    this.y /= length;
    this.z /= length;
    this.w /= length;
    return this;
  }

  slerp(other: ToolcraftOrientationQuaternion, progress: number): this {
    const amount = Math.max(0, Math.min(1, progress));
    let targetX = other.x;
    let targetY = other.y;
    let targetZ = other.z;
    let targetW = other.w;
    let cosine =
      this.x * targetX + this.y * targetY + this.z * targetZ + this.w * targetW;

    if (cosine < 0) {
      cosine = -cosine;
      targetX = -targetX;
      targetY = -targetY;
      targetZ = -targetZ;
      targetW = -targetW;
    }

    if (cosine > 0.9995) {
      this.x += (targetX - this.x) * amount;
      this.y += (targetY - this.y) * amount;
      this.z += (targetZ - this.z) * amount;
      this.w += (targetW - this.w) * amount;
      return this.normalize();
    }

    const angle = Math.acos(Math.max(-1, Math.min(1, cosine)));
    const sine = Math.sin(angle);
    const startScale = Math.sin((1 - amount) * angle) / sine;
    const targetScale = Math.sin(amount * angle) / sine;

    this.x = this.x * startScale + targetX * targetScale;
    this.y = this.y * startScale + targetY * targetScale;
    this.z = this.z * startScale + targetZ * targetScale;
    this.w = this.w * startScale + targetW * targetScale;
    return this.normalize();
  }
}

export function applyOrientationQuaternion(
  vector: ToolcraftOrientationVector,
  quaternion: ToolcraftOrientationQuaternion,
): [number, number, number] {
  const [x, y, z] = vector;
  const { w, x: qx, y: qy, z: qz } = quaternion;
  const ix = w * x + qy * z - qz * y;
  const iy = w * y + qz * x - qx * z;
  const iz = w * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;

  return [
    ix * w + iw * -qx + iy * -qz - iz * -qy,
    iy * w + iw * -qy + iz * -qx - ix * -qz,
    iz * w + iw * -qz + ix * -qy - iy * -qx,
  ];
}

export function getOrientationQuaternionFromBasis(
  right: ToolcraftOrientationVector,
  up: ToolcraftOrientationVector,
  back: ToolcraftOrientationVector,
): ToolcraftOrientationQuaternion {
  const m11 = right[0];
  const m12 = up[0];
  const m13 = back[0];
  const m21 = right[1];
  const m22 = up[1];
  const m23 = back[1];
  const m31 = right[2];
  const m32 = up[2];
  const m33 = back[2];
  const trace = m11 + m22 + m33;
  const quaternion = new ToolcraftOrientationQuaternion();

  if (trace > 0) {
    const scale = 0.5 / Math.sqrt(trace + 1);
    quaternion.w = 0.25 / scale;
    quaternion.x = (m32 - m23) * scale;
    quaternion.y = (m13 - m31) * scale;
    quaternion.z = (m21 - m12) * scale;
  } else if (m11 > m22 && m11 > m33) {
    const scale = 2 * Math.sqrt(1 + m11 - m22 - m33);
    quaternion.w = (m32 - m23) / scale;
    quaternion.x = 0.25 * scale;
    quaternion.y = (m12 + m21) / scale;
    quaternion.z = (m13 + m31) / scale;
  } else if (m22 > m33) {
    const scale = 2 * Math.sqrt(1 + m22 - m11 - m33);
    quaternion.w = (m13 - m31) / scale;
    quaternion.x = (m12 + m21) / scale;
    quaternion.y = 0.25 * scale;
    quaternion.z = (m23 + m32) / scale;
  } else {
    const scale = 2 * Math.sqrt(1 + m33 - m11 - m22);
    quaternion.w = (m21 - m12) / scale;
    quaternion.x = (m13 + m31) / scale;
    quaternion.y = (m23 + m32) / scale;
    quaternion.z = 0.25 * scale;
  }

  return quaternion.normalize();
}

export function getOrientationQuaternionFromAxisAngle(
  axisValue: ToolcraftOrientationVector,
  angle: number,
): ToolcraftOrientationQuaternion {
  const axis = normalizeOrientationVector(axisValue);
  const halfAngle = Number.isFinite(angle) ? angle / 2 : 0;
  const sine = Math.sin(halfAngle);

  return new ToolcraftOrientationQuaternion(
    axis[0] * sine,
    axis[1] * sine,
    axis[2] * sine,
    Math.cos(halfAngle),
  ).normalize();
}

export function getOrientationQuaternionFromUnitVectors(
  fromValue: ToolcraftOrientationVector,
  toValue: ToolcraftOrientationVector,
): ToolcraftOrientationQuaternion {
  const from = normalizeOrientationVector(fromValue);
  const to = normalizeOrientationVector(toValue);
  let real = dotOrientationVectors(from, to) + 1;
  let imaginary: [number, number, number];

  if (real < 1e-6) {
    real = 0;
    imaginary =
      Math.abs(from[0]) > Math.abs(from[2])
        ? [-from[1], from[0], 0]
        : [0, -from[2], from[1]];
  } else {
    imaginary = crossOrientationVectors(from, to);
  }

  return new ToolcraftOrientationQuaternion(
    imaginary[0],
    imaginary[1],
    imaginary[2],
    real,
  ).normalize();
}
