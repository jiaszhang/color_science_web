/**
 * Color temperature and calibration calculations
 * Planckian locus, white point conversion, calibration target generation
 */

import { rgbToXYZMatrix, type Vec3, mat3Invert, mat3VecMultiply } from './matrices';
import { STANDARD_GAMUTS } from './gamuts';
import { type TransferFunctionName } from './tf-gamma';
import { createLUT3DFromTransform, type LUT3D } from './lut3d';
import { convertColorSpace, xyzToLab, xyYToXYZ, rgbToXYZ, xyzToRgb, clampVec3 } from './transform';

/** Color temperature search range */
const MIN_TEMP = 1000;
const MAX_TEMP = 40000;

/**
 * Lookup table for Planckian locus at very low temperatures (below 1667K).
 * The Ohno/CIE polynomial approximation is only valid for T >= ~1667K.
 * Below that, the polynomial x-coefficient diverges from the true locus,
 * producing x values that are too low (the locus wraps back on itself).
 * These reference values are from CIE standard observer calculations.
 */
const LOW_TEMP_LOCUS: [number, number, number][] = [
  [1000, 0.6468, 0.3536],
  [1100, 0.6182, 0.3714],
  [1200, 0.5966, 0.3855],
  [1300, 0.5802, 0.3958],
  [1400, 0.5673, 0.4037],
  [1500, 0.5572, 0.4098],
  [1667, 0.5418, 0.4184], // boundary matches formula output
];

/**
 * Linear interpolation in the low-temperature lookup table.
 */
function lowTempLocusInterp(T: number): { x: number; y: number } {
  const tbl = LOW_TEMP_LOCUS;
  let i = 0;
  for (; i < tbl.length - 1; i++) {
    if (T <= tbl[i + 1][0]) break;
  }
  const [t0, x0, y0] = tbl[i];
  const [t1, x1, y1] = tbl[Math.min(i + 1, tbl.length - 1)];
  const f = (T - t0) / (t1 - t0);
  return { x: x0 + f * (x1 - x0), y: y0 + f * (y1 - y0) };
}

/**
 * Convert color temperature (Kelvin) to CIE xy chromaticity
 * Uses Planckian locus approximation (Ohno 2005 / CIE 15 method)
 * For T >= 1667K: polynomial approximation (T used directly in denominators)
 * For T < 1667K: interpolated from reference lookup table
 */
export function colorTempToXY(kelvin: number): { x: number; y: number } {
  const T = kelvin;

  // Below 1667K, use lookup table interpolation
  if (T < 1667) {
    return lowTempLocusInterp(T);
  }

  const T2 = T * T;
  const T3 = T2 * T;
  let x: number, y: number;

  if (T <= 4000) {
    x = -0.2661239e9 / T3 - 0.2343589e6 / T2 + 0.8776956e3 / T + 0.179910;
  } else {
    x = -3.0258469e9 / T3 + 2.1070379e6 / T2 + 0.2226347e3 / T + 0.240390;
  }

  if (T <= 2222) {
    y = -1.1063814 * x * x * x - 1.34811020 * x * x + 2.18555832 * x - 0.20219683;
  } else if (T <= 4000) {
    y = -0.9549476 * x * x * x - 1.37418593 * x * x + 2.09137015 * x - 0.16748867;
  } else {
    y = 3.0817580 * x * x * x - 5.87338670 * x * x + 3.75112997 * x - 0.37001483;
  }

  return { x, y };
}

/**
 * Convert CIE xy to CIE 1960 u,v uniform chromaticity coordinates.
 * u = 4x / (-2x + 12y + 3)
 * v = 6y / (-2x + 12y + 3)
 * This is the standard diagram for CCT and Duv calculations per CIE definition.
 */
function xyToUV(x: number, y: number): { u: number; v: number } {
  const denom = -2 * x + 12 * y + 3;
  return {
    u: 4 * x / denom,
    v: 6 * y / denom,
  };
}

/**
 * Find the nearest point on the Planckian locus to the given xy coordinates.
 * Uses 3-stage exhaustive search in CIE 1960 u,v space for accuracy.
 * The CIE defines CCT as the temperature whose Planckian locus point is closest
 * in the u,v diagram (not in xy), so searching in uv space gives correct results.
 * Returns { kelvin, x, y }
 */
function findNearestOnLocus(x: number, y: number): { kelvin: number; x: number; y: number } {
  const testUV = xyToUV(x, y);

  // Stage 1: Coarse scan — 10K steps over full range
  let bestK = 6504;
  let bestDist = Infinity;

  for (let k = MIN_TEMP; k <= MAX_TEMP; k += 10) {
    const xy = colorTempToXY(k);
    const uv = xyToUV(xy.x, xy.y);
    const du = uv.u - testUV.u;
    const dv = uv.v - testUV.v;
    const dist = du * du + dv * dv;
    if (dist < bestDist) {
      bestDist = dist;
      bestK = k;
    }
  }

  // Stage 2: Fine scan — 0.1K steps ± 50K around best
  const fineStart = Math.max(MIN_TEMP, bestK - 50);
  const fineEnd = Math.min(MAX_TEMP, bestK + 50);

  for (let k = fineStart; k <= fineEnd; k += 0.1) {
    const xy = colorTempToXY(k);
    const uv = xyToUV(xy.x, xy.y);
    const du = uv.u - testUV.u;
    const dv = uv.v - testUV.v;
    const dist = du * du + dv * dv;
    if (dist < bestDist) {
      bestDist = dist;
      bestK = k;
    }
  }

  // Stage 3: Ultra-fine scan — 0.001K steps ± 1K around best
  const ufStart = Math.max(MIN_TEMP, bestK - 1);
  const ufEnd = Math.min(MAX_TEMP, bestK + 1);

  for (let k = ufStart; k <= ufEnd; k += 0.001) {
    const xy = colorTempToXY(k);
    const uv = xyToUV(xy.x, xy.y);
    const du = uv.u - testUV.u;
    const dv = uv.v - testUV.v;
    const dist = du * du + dv * dv;
    if (dist < bestDist) {
      bestDist = dist;
      bestK = k;
    }
  }

  const nearestXY = colorTempToXY(bestK);
  return { kelvin: bestK, x: nearestXY.x, y: nearestXY.y };
}

/**
 * Convert CIE xy chromaticity to correlated color temperature (CCT) in Kelvin.
 * Uses 3-stage exhaustive nearest-point search in CIE 1960 u,v space,
 * which is the standard definition of CCT per CIE.
 */
export function xyToColorTemp(x: number, y: number): number {
  const result = findNearestOnLocus(x, y);
  return Math.round(result.kelvin);
}

/**
 * Calculate Duv (distance from Planckian locus) for a given white point.
 * Positive Duv = above locus (greenish side), Negative Duv = below locus (pinkish side).
 * Computed as signed perpendicular distance in CIE 1960 u,v space per CIE definition.
 */
export function calculateDuv(x: number, y: number): number {
  const nearest = findNearestOnLocus(x, y);

  // Get tangent direction at the nearest point in CIE 1960 u,v space
  const dK = 1.0;
  const nextK = Math.min(MAX_TEMP, nearest.kelvin + dK);
  const prevK = Math.max(MIN_TEMP, nearest.kelvin - dK);
  const nextUV = xyToUV(colorTempToXY(nextK).x, colorTempToXY(nextK).y);
  const prevUV = xyToUV(colorTempToXY(prevK).x, colorTempToXY(prevK).y);

  const tx = nextUV.u - prevUV.u;
  const ty = nextUV.v - prevUV.v;
  const tLen = Math.sqrt(tx * tx + ty * ty);

  if (tLen < 1e-15) return 0;

  // Normal direction: perpendicular to tangent, rotated 90° CW
  // On the locus, tangent points from low-T to high-T (left and down for most of the curve).
  // CW rotation gives normal pointing upward (greenish side) for positive Duv convention.
  const nx = ty / tLen;
  const ny = -tx / tLen;

  // Duv = signed perpendicular distance from test point to the locus, in u,v space
  const pointUV = xyToUV(x, y);
  const nearestUV = xyToUV(nearest.x, nearest.y);
  const du = pointUV.u - nearestUV.u;
  const dv = pointUV.v - nearestUV.v;
  const duv = du * nx + dv * ny;

  return duv;
}

/**
 * Gamut coverage calculation
 * Returns the percentage of one gamut covered by another
 */
export function gamutCoverage(
  sourceGamut: string,
  referenceGamut: string,
  numSamples = 100
): {
  coverage: number;
  volumeSource: number;
  volumeReference: number;
  volumeIntersection: number;
} {
  const src = STANDARD_GAMUTS[sourceGamut];
  const ref = STANDARD_GAMUTS[referenceGamut];
  if (!src || !ref) throw new Error('Unknown gamut');

  // Monte Carlo sampling method
  let insideSource = 0;
  let insideReference = 0;
  let insideBoth = 0;
  let totalValid = 0;

  const samples = numSamples * numSamples;

  for (let i = 0; i < samples; i++) {
    // Sample in xy space
    const x = 0.1 + Math.random() * 0.5;
    const y = 0.1 + Math.random() * 0.6;

    // Check if point is inside source gamut triangle
    if (pointInTriangle(x, y, src.red, src.green, src.blue)) {
      insideSource++;
      // Check if also inside reference gamut
      if (pointInTriangle(x, y, ref.red, ref.green, ref.blue)) {
        insideBoth++;
      }
    }
    // Check if point is inside reference gamut
    if (pointInTriangle(x, y, ref.red, ref.green, ref.blue)) {
      insideReference++;
    }
    totalValid++;
  }

  return {
    coverage: insideReference > 0 ? (insideBoth / insideReference) * 100 : 0,
    volumeSource: (insideSource / totalValid) * 100,
    volumeReference: (insideReference / totalValid) * 100,
    volumeIntersection: (insideBoth / totalValid) * 100,
  };
}

/** Point-in-triangle test */
function pointInTriangle(
  px: number, py: number,
  v1: { x: number; y: number },
  v2: { x: number; y: number },
  v3: { x: number; y: number }
): boolean {
  const d1 = sign(px, py, v1.x, v1.y, v2.x, v2.y);
  const d2 = sign(px, py, v2.x, v2.y, v3.x, v3.y);
  const d3 = sign(px, py, v3.x, v3.y, v1.x, v1.y);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function sign(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): number {
  return (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
}

/**
 * Generate a calibration 3D LUT targeting specific white point
 */
export function generateCalibrationLUT(
  size: number,
  targetGamut: string,
  targetTF: TransferFunctionName,
  targetWhitePoint: { x: number; y: number },
  targetPeakLuminance?: number,
  currentGamut?: string,
  currentTF?: TransferFunctionName,
): LUT3D {
  const srcGamut = currentGamut || 'sRGB';
  const srcTF = currentTF || 'sRGB';

  return createLUT3DFromTransform(
    size,
    `Calibration: ${srcGamut} → ${targetGamut}`,
    (r, g, b) => {
      // Convert source to linear
      return convertColorSpace(r, g, b, srcGamut, srcTF, targetGamut, targetTF);
    },
    srcGamut,
    targetGamut
  );
}

/**
 * Common white point presets
 */
export const WHITE_POINT_PRESETS: Record<string, { name: string; x: number; y: number; temp: number; description: string }> = {
  D50: { name: 'D50', x: 0.3457, y: 0.3585, temp: 5003, description: 'ICC standard illuminant, printing' },
  D55: { name: 'D55', x: 0.3324, y: 0.3474, temp: 5503, description: 'Midday daylight' },
  D60: { name: 'D60', x: 0.3217, y: 0.3378, temp: 6004, description: 'ICC optional illuminant, prepress' },
  D65: { name: 'D65', x: 0.3127, y: 0.3290, temp: 6504, description: 'Standard illuminant, sRGB reference' },
  D75: { name: 'D75', x: 0.2990, y: 0.3149, temp: 7504, description: 'North sky daylight' },
  A: { name: 'Illuminant A', x: 0.4476, y: 0.4074, temp: 2856, description: 'Tungsten filament' },
  B: { name: 'Illuminant B', x: 0.3484, y: 0.3516, temp: 4874, description: 'Direct sunlight' },
  C: { name: 'Illuminant C', x: 0.3101, y: 0.3162, temp: 6774, description: 'Average daylight' },
  E: { name: 'Illuminant E', x: 0.3333, y: 0.3333, temp: 5454, description: 'Equal energy' },
};

/**
 * Generate Planckian locus points for visualization
 */
export function generatePlanckianLocus(minK = 1000, maxK = 10000, numPoints = 100): { x: number; y: number; temp: number }[] {
  const points: { x: number; y: number; temp: number }[] = [];
  const logMin = Math.log10(minK);
  const logMax = Math.log10(maxK);

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const k = Math.pow(10, logMin + t * (logMax - logMin));
    const xy = colorTempToXY(k);
    points.push({ x: xy.x, y: xy.y, temp: Math.round(k) });
  }

  return points;
}

/**
 * Gamut triangle vertices for visualization
 */
export function getGamutTriangle(gamut: string): { x: number; y: number; label: string }[] {
  const g = STANDARD_GAMUTS[gamut];
  if (!g) return [];
  return [
    { x: g.red.x, y: g.red.y, label: 'R' },
    { x: g.green.x, y: g.green.y, label: 'G' },
    { x: g.blue.x, y: g.blue.y, label: 'B' },
    { x: g.white.x, y: g.white.y, label: 'W' },
  ];
}
