/**
 * Color space transformation functions
 * RGB ↔ Linear RGB ↔ XYZ ↔ xyY ↔ Lab
 */

import { type Mat3, type Vec3, rgbToXYZMatrix, xyzToRGBMatrix, clampVec3 } from './matrices';
import { STANDARD_GAMUTS, type GamutPrimaries } from './gamuts';
import { decodeTF, encodeTF, type TransferFunctionName } from './tf-gamma';

/** RGB values with color space info */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
  gamut: string;
  tf: TransferFunctionName;
}

/** XYZ color values */
export interface XYZColor {
  X: number;
  Y: number;
  Z: number;
}

/** xyY chromaticity */
export interface xyYColor {
  x: number;
  y: number;
  Y: number;
}

/** CIE L*a*b* */
export interface LabColor {
  L: number;
  a: number;
  b: number;
}

/** Cache for computed matrices */
const matrixCache = new Map<string, Mat3>();

function getMatrixKey(gamut: string, direction: 'toXYZ' | 'toRGB'): string {
  return `${gamut}_${direction}`;
}

function getRGBToXYZ(gamut: string): Mat3 {
  const key = getMatrixKey(gamut, 'toXYZ');
  if (matrixCache.has(key)) return matrixCache.get(key)!;
  const g = STANDARD_GAMUTS[gamut];
  if (!g) throw new Error(`Unknown gamut: ${gamut}`);
  const m = rgbToXYZMatrix(g.red, g.green, g.blue, g.white);
  matrixCache.set(key, m);
  return m;
}

function getXYZToRGB(gamut: string): Mat3 {
  const key = getMatrixKey(gamut, 'toRGB');
  if (matrixCache.has(key)) return matrixCache.get(key)!;
  const rgbToXYZ = getRGBToXYZ(gamut);
  const m = xyzToRGBMatrix(rgbToXYZ);
  matrixCache.set(key, m);
  return m;
}

/**
 * Convert RGB (in a specific gamut/TF) to linear RGB
 */
export function rgbToLinear(r: number, g: number, b: number, tf: TransferFunctionName, gamma = 2.2): Vec3 {
  return [
    decodeTF(r, tf, gamma),
    decodeTF(g, tf, gamma),
    decodeTF(b, tf, gamma),
  ];
}

/**
 * Convert linear RGB to RGB (apply transfer function encoding)
 */
export function linearToRgb(lr: number, lg: number, lb: number, tf: TransferFunctionName, gamma = 2.2): Vec3 {
  return [
    encodeTF(lr, tf, gamma),
    encodeTF(lg, tf, gamma),
    encodeTF(lb, tf, gamma),
  ];
}

/**
 * Convert RGB to XYZ
 * @param r,g,b - RGB values (0-1, encoded with transfer function)
 * @param gamut - Color space name
 * @param tf - Transfer function name
 */
export function rgbToXYZ(r: number, g: number, b: number, gamut: string, tf: TransferFunctionName, gamma = 2.2): XYZColor {
  // Decode transfer function to linear
  const [lr, lg, lb] = rgbToLinear(r, g, b, tf, gamma);
  // Apply RGB to XYZ matrix
  const matrix = getRGBToXYZ(gamut);
  const xyz = [
    matrix[0][0] * lr + matrix[0][1] * lg + matrix[0][2] * lb,
    matrix[1][0] * lr + matrix[1][1] * lg + matrix[1][2] * lb,
    matrix[2][0] * lr + matrix[2][1] * lg + matrix[2][2] * lb,
  ];
  return { X: xyz[0], Y: xyz[1], Z: xyz[2] };
}

/**
 * Convert XYZ to linear RGB (no transfer function encoding)
 * @param X,Y,Z - XYZ color values
 * @param gamut - Target color space
 * @returns Vec3 of linear RGB values (may be outside 0-1 range)
 */
export function xyzToLinearRgb(X: number, Y: number, Z: number, gamut: string): Vec3 {
  const matrix = getXYZToRGB(gamut);
  return [
    matrix[0][0] * X + matrix[0][1] * Y + matrix[0][2] * Z,
    matrix[1][0] * X + matrix[1][1] * Y + matrix[1][2] * Z,
    matrix[2][0] * X + matrix[2][1] * Y + matrix[2][2] * Z,
  ];
}

/**
 * Convert XYZ to RGB
 * @param xyz - XYZ color values
 * @param gamut - Target color space
 * @param tf - Target transfer function
 */
export function xyzToRgb(X: number, Y: number, Z: number, gamut: string, tf: TransferFunctionName, gamma = 2.2): Vec3 {
  const rgb = xyzToLinearRgb(X, Y, Z, gamut);
  // Encode with transfer function
  return linearToRgb(rgb[0], rgb[1], rgb[2], tf, gamma);
}

/**
 * Convert between color spaces: RGB(src) → RGB(dst)
 */
export function convertColorSpace(
  r: number, g: number, b: number,
  srcGamut: string, srcTF: TransferFunctionName,
  dstGamut: string, dstTF: TransferFunctionName,
  gamma = 2.2
): Vec3 {
  // RGB(src) → Linear → XYZ → Linear(dst) → RGB(dst)
  const xyz = rgbToXYZ(r, g, b, srcGamut, srcTF, gamma);
  return xyzToRgb(xyz.X, xyz.Y, xyz.Z, dstGamut, dstTF, gamma);
}

/**
 * Convert XYZ to xyY
 */
export function xyzToXyY(X: number, Y: number, Z: number): xyYColor {
  const sum = X + Y + Z;
  if (sum === 0) return { x: 0.3127, y: 0.3290, Y: 0 }; // D65 fallback for black
  return {
    x: X / sum,
    y: Y / sum,
    Y: Y,
  };
}

/**
 * Convert xyY to XYZ
 */
export function xyYToXYZ(x: number, y: number, Y: number): XYZColor {
  if (y === 0) return { X: 0, Y: 0, Z: 0 };
  return {
    X: (x * Y) / y,
    Y: Y,
    Z: ((1 - x - y) * Y) / y,
  };
}

/**
 * Convert XYZ to CIE L*a*b* (D65 reference white)
 */
export function xyzToLab(X: number, Y: number, Z: number): LabColor {
  // D65 reference white
  const Xn = 0.95047;
  const Yn = 1.0;
  const Zn = 1.08883;

  function f(t: number): number {
    const delta = 6 / 29;
    if (t > delta * delta * delta) {
      return Math.cbrt(t);
    }
    return t / (3 * delta * delta) + 4 / 29;
  }

  const fx = f(X / Xn);
  const fy = f(Y / Yn);
  const fz = f(Z / Zn);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/**
 * Convert CIE L*a*b* to XYZ (D65 reference white)
 */
export function labToXYZ(L: number, a: number, b: number): XYZColor {
  const Xn = 0.95047;
  const Yn = 1.0;
  const Zn = 1.08883;

  function finv(t: number): number {
    const delta = 6 / 29;
    if (t > delta) {
      return t * t * t;
    }
    return 3 * delta * delta * (t - 4 / 29);
  }

  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  return {
    X: Xn * finv(fx),
    Y: Yn * finv(fy),
    Z: Zn * finv(fz),
  };
}

/**
 * Convert RGB to xyY chromaticity
 */
export function rgbToXyY(r: number, g: number, b: number, gamut: string, tf: TransferFunctionName, gamma = 2.2): xyYColor {
  const xyz = rgbToXYZ(r, g, b, gamut, tf, gamma);
  return xyzToXyY(xyz.X, xyz.Y, xyz.Z);
}

/**
 * Convert xyY to RGB
 */
export function xyYToRgb(x: number, y: number, Y: number, gamut: string, tf: TransferFunctionName, gamma = 2.2): Vec3 {
  const xyz = xyYToXYZ(x, y, Y);
  const rgb = xyzToRgb(xyz.X, xyz.Y, xyz.Z, gamut, tf, gamma);
  return clampVec3(rgb);
}

/**
 * Convert CIE xy chromaticity to RGB
 * Returns null if the xy coordinate is out of gamut
 * @param x - CIE x chromaticity (0-1)
 * @param y - CIE y chromaticity (0-1)
 * @param Y - Relative luminance (0-1)
 * @param gamut - Target color space name
 * @param tf - Target transfer function
 * @param gamma - Custom gamma value (only used for 'custom' TF)
 * @returns Vec3 of RGB values, or null if the xy coordinate is out of gamut
 */
export function xyToRgb(x: number, y: number, Y: number, gamut: string, tf: TransferFunctionName, gamma = 2.2): Vec3 | null {
  const xyz = xyYToXYZ(x, y, Y);
  const rgb = xyzToRgb(xyz.X, xyz.Y, xyz.Z, gamut, tf, gamma);
  // Check out-of-gamut with small tolerance
  const tolerance = 0.001;
  if (rgb[0] < -tolerance || rgb[0] > 1 + tolerance ||
      rgb[1] < -tolerance || rgb[1] > 1 + tolerance ||
      rgb[2] < -tolerance || rgb[2] > 1 + tolerance) {
    return null;
  }
  return clampVec3(rgb);
}

/**
 * Range type for video levels
 */
export type VideoRange = 'full' | 'limited';

/**
 * Convert Full Range (0-255) to Limited Range (16-235 for 8-bit)
 * In normalized 0-1 terms:
 * limited = full * (219/255) + (16/255)
 * limited = full * 0.858824 + 0.062745
 */
export function fullToLimited(value: number): number {
  return value * (219 / 255) + (16 / 255);
}

/**
 * Convert Limited Range to Full Range
 * In normalized 0-1 terms:
 * full = (limited - 16/255) / (219/255)
 * full = (limited - 0.062745) / 0.858824
 */
export function limitedToFull(value: number): number {
  return (value - 16 / 255) / (219 / 255);
}

/**
 * Apply range conversion to RGB triplet
 */
export function convertRange(r: number, g: number, b: number, from: VideoRange, to: VideoRange): Vec3 {
  if (from === to) return [r, g, b];
  const fn = from === 'full' ? fullToLimited : limitedToFull;
  return [fn(r), fn(g), fn(b)];
}

/**
 * Full range RGB conversion with range support
 * Converts RGB from source gamut/TF/range to destination gamut/TF/range
 */
export function convertColorSpaceWithRange(
  r: number, g: number, b: number,
  srcGamut: string, srcTF: TransferFunctionName, srcRange: VideoRange,
  dstGamut: string, dstTF: TransferFunctionName, dstRange: VideoRange,
  gamma = 2.2
): Vec3 {
  // Step 1: Source range → Full range (if limited, expand to full first)
  const fullRgb = srcRange === 'limited'
    ? [limitedToFull(r), limitedToFull(g), limitedToFull(b)]
    : [r, g, b];

  // Step 2: Color space conversion (full range)
  const converted = convertColorSpace(fullRgb[0], fullRgb[1], fullRgb[2], srcGamut, srcTF, dstGamut, dstTF, gamma);

  // Step 3: Full range → Destination range (if limited, compress)
  if (dstRange === 'limited') {
    return [fullToLimited(converted[0]), fullToLimited(converted[1]), fullToLimited(converted[2])];
  }
  return converted;
}

/**
 * Generate range conversion curve data for visualization
 */
export function generateRangeCurveData(): { input: number; fullRange: number; limitedRange: number }[] {
  const points: { input: number; fullRange: number; limitedRange: number }[] = [];
  for (let i = 0; i <= 256; i++) {
    const v = i / 256;
    points.push({
      input: v,
      fullRange: v,
      limitedRange: fullToLimited(v),
    });
  }
  return points;
}
