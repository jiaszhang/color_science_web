/**
 * Matrix operations for color science
 * 3x3 matrix multiplication, inversion, RGB ↔ XYZ transformations
 */

export type Mat3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

export type Vec3 = [number, number, number];

/** Multiply two 3x3 matrices */
export function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
  const result: Mat3 = [[0,0,0],[0,0,0],[0,0,0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

/** Multiply 3x3 matrix by 3-vector */
export function mat3VecMultiply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** Determinant of 3x3 matrix */
export function mat3Determinant(m: Mat3): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/** Invert a 3x3 matrix */
export function mat3Invert(m: Mat3): Mat3 {
  const det = mat3Determinant(m);
  if (Math.abs(det) < 1e-10) {
    throw new Error('Matrix is singular and cannot be inverted');
  }
  const invDet = 1 / det;
  return [
    [
      (m[1][1] * m[2][2] - m[1][2] * m[2][1]) * invDet,
      (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * invDet,
      (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * invDet,
    ],
    [
      (m[1][2] * m[2][0] - m[1][0] * m[2][2]) * invDet,
      (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * invDet,
      (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * invDet,
    ],
    [
      (m[1][0] * m[2][1] - m[1][1] * m[2][0]) * invDet,
      (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * invDet,
      (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * invDet,
    ],
  ];
}

/** Transpose a 3x3 matrix */
export function mat3Transpose(m: Mat3): Mat3 {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

/** Identity matrix */
export function mat3Identity(): Mat3 {
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
}

/**
 * Compute the RGB to XYZ matrix from gamut primaries
 * @param primaries - R, G, B chromaticity coordinates {x, y}
 * @param whitePoint - White point chromaticity {x, y}
 * @returns 3x3 matrix that transforms [R, G, B] → [X, Y, Z]
 */
export function rgbToXYZMatrix(
  r: { x: number; y: number },
  g: { x: number; y: number },
  b: { x: number; y: number },
  whitePoint: { x: number; y: number }
): Mat3 {
  // Construct matrix P from chromaticities
  // P = [rx gx bx; ry gy by; (1-rx-ry) (1-gx-gy) (1-bx-by)]
  const P: Mat3 = [
    [r.x, g.x, b.x],
    [r.y, g.y, b.y],
    [1 - r.x - r.y, 1 - g.x - g.y, 1 - b.x - b.y],
  ];

  // White point in XYZ (normalized so Y = 1)
  const wpScale = 1 / whitePoint.y;
  const W: Vec3 = [whitePoint.x * wpScale, 1, (1 - whitePoint.x - whitePoint.y) * wpScale];

  // Solve P * S = W → S = P^-1 * W
  const Pinv = mat3Invert(P);
  const S = mat3VecMultiply(Pinv, W);

  // M = P * diag(S)
  const M: Mat3 = [
    [P[0][0] * S[0], P[0][1] * S[1], P[0][2] * S[2]],
    [P[1][0] * S[0], P[1][1] * S[1], P[1][2] * S[2]],
    [P[2][0] * S[0], P[2][1] * S[1], P[2][2] * S[2]],
  ];

  return M;
}

/**
 * Compute the XYZ to RGB matrix (inverse of RGB to XYZ)
 */
export function xyzToRGBMatrix(rgbToXYZ: Mat3): Mat3 {
  return mat3Invert(rgbToXYZ);
}

/**
 * Convert D65-based XYZ to D50-based XYZ using Bradford chromatic adaptation
 */
export function adaptD65toD50(XYZ: Vec3): Vec3 {
  // Bradford matrix
  const Ma: Mat3 = [
    [ 0.8951000,  0.2664000, -0.1614000],
    [-0.7502000,  1.7135000,  0.0367000],
    [ 0.0389000, -0.0685000,  1.0296000],
  ];
  const Mai = mat3Invert(Ma);

  // Source and destination white points in cone space
  const wpD65: Vec3 = mat3VecMultiply(Ma, [0.95047, 1.0, 1.08883]);
  const wpD50: Vec3 = mat3VecMultiply(Ma, [0.96422, 1.0, 0.82521]);

  // Scale matrix
  const S: Mat3 = [
    [wpD50[0] / wpD65[0], 0, 0],
    [0, wpD50[1] / wpD65[1], 0],
    [0, 0, wpD50[2] / wpD65[2]],
  ];

  const M = mat3Multiply(Mai, mat3Multiply(S, Ma));
  return mat3VecMultiply(M, XYZ);
}

/**
 * Convert D50-based XYZ to D65-based XYZ
 */
export function adaptD50toD65(XYZ: Vec3): Vec3 {
  // Bradford matrix
  const Ma: Mat3 = [
    [ 0.8951000,  0.2664000, -0.1614000],
    [-0.7502000,  1.7135000,  0.0367000],
    [ 0.0389000, -0.0685000,  1.0296000],
  ];
  const Mai = mat3Invert(Ma);

  const wpD65: Vec3 = mat3VecMultiply(Ma, [0.95047, 1.0, 1.08883]);
  const wpD50: Vec3 = mat3VecMultiply(Ma, [0.96422, 1.0, 0.82521]);

  const S: Mat3 = [
    [wpD65[0] / wpD50[0], 0, 0],
    [0, wpD65[1] / wpD50[1], 0],
    [0, 0, wpD65[2] / wpD50[2]],
  ];

  const M = mat3Multiply(Mai, mat3Multiply(S, Ma));
  return mat3VecMultiply(M, XYZ);
}

/** Format matrix to display string */
export function formatMatrix(m: Mat3, precision = 6): string {
  return m.map(row =>
    row.map(v => v.toFixed(precision).padStart(precision + 4)).join('  ')
  ).join('\n');
}

/** Clamp a 3-vector to [min, max] */
export function clampVec3(v: Vec3, min = 0, max = 1): Vec3 {
  return [
    Math.max(min, Math.min(max, v[0])),
    Math.max(min, Math.min(max, v[1])),
    Math.max(min, Math.min(max, v[2])),
  ];
}
