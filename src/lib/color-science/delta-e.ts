/**
 * Color difference (Delta E) calculations
 * Supports ΔE76 (CIE76), ΔE94, ΔE2000 (CIEDE2000)
 */

import type { LabColor } from './transform';
import { xyzToLab, rgbToXYZ } from './transform';

/**
 * CIE76 color difference (simple Euclidean in Lab)
 */
export function deltaE76(lab1: LabColor, lab2: LabColor): number {
  return Math.sqrt(
    Math.pow(lab1.L - lab2.L, 2) +
    Math.pow(lab1.a - lab2.a, 2) +
    Math.pow(lab1.b - lab2.b, 2)
  );
}

/**
 * CIEDE94 color difference
 */
export function deltaE94(lab1: LabColor, lab2: LabColor, application: 'graphicArts' | 'textiles' = 'graphicArts'): number {
  const kL = application === 'graphicArts' ? 1 : 2;
  const K1 = application === 'graphicArts' ? 0.045 : 0.048;
  const K2 = application === 'graphicArts' ? 0.015 : 0.014;

  const C1 = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b);
  const C2 = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b);

  const dL = lab1.L - lab2.L;
  const dC = C1 - C2;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  const dH = Math.sqrt(Math.max(0, da * da + db * db - dC * dC));

  const SL = 1;
  const SC = 1 + K1 * C1;
  const SH = 1 + K2 * C1;

  return Math.sqrt(
    Math.pow(dL / (kL * SL), 2) +
    Math.pow(dC / SC, 2) +
    Math.pow(dH / SH, 2)
  );
}

/**
 * CIEDE2000 color difference (most accurate perceptual metric)
 */
export function deltaE2000(lab1: LabColor, lab2: LabColor): number {
  const L1 = lab1.L, a1 = lab1.a, b1 = lab1.b;
  const L2 = lab2.L, a2 = lab2.a, b2 = lab2.b;

  // Step 1: Calculate Cab, hab
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab_mean = (C1 + C2) / 2;

  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cab_mean, 7) / (Math.pow(Cab_mean, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);

  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = Math.atan2(b1, a1p) * 180 / Math.PI;
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * 180 / Math.PI;
  if (h2p < 0) h2p += 360;

  // Step 2: Calculate delta values
  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }

  let dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2 * Math.PI / 180);

  // Step 3: Calculate CIEDE2000
  const Lp_mean = (L1 + L2) / 2;
  const Cp_mean = (C1p + C2p) / 2;

  let hp_mean: number;
  if (C1p * C2p === 0) {
    hp_mean = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hp_mean = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hp_mean = (h1p + h2p + 360) / 2;
  } else {
    hp_mean = (h1p + h2p - 360) / 2;
  }

  const T = 1 -
    0.17 * Math.cos((hp_mean - 30) * Math.PI / 180) +
    0.24 * Math.cos(2 * hp_mean * Math.PI / 180) +
    0.32 * Math.cos((3 * hp_mean + 6) * Math.PI / 180) -
    0.20 * Math.cos((4 * hp_mean - 63) * Math.PI / 180);

  const SL = 1 + 0.015 * Math.pow(Lp_mean - 50, 2) / Math.sqrt(20 + Math.pow(Lp_mean - 50, 2));
  const SC = 1 + 0.045 * Cp_mean;
  const SH = 1 + 0.015 * Cp_mean * T;

  let RT: number;
  const dTheta = 30 * Math.exp(-Math.pow((hp_mean - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(Cp_mean, 7) / (Math.pow(Cp_mean, 7) + Math.pow(25, 7)));
  RT = -Math.sin(2 * dTheta * Math.PI / 180) * RC;

  const dE = Math.sqrt(
    Math.pow(dLp / SL, 2) +
    Math.pow(dCp / SC, 2) +
    Math.pow(dHp / SH, 2) +
    RT * (dCp / SC) * (dHp / SH)
  );

  return dE;
}

/**
 * Interpret Delta E value
 */
export function interpretDeltaE(dE: number): { level: string; description: string; color: string } {
  if (dE < 1) return { level: 'Imperceptible', description: 'Difference not noticeable', color: '#22c55e' };
  if (dE < 2) return { level: 'Barely Noticeable', description: 'Only noticeable to trained eye', color: '#84cc16' };
  if (dE < 3.5) return { level: 'Noticeable', description: 'Noticeable at a glance', color: '#eab308' };
  if (dE < 5) return { level: 'Significant', description: 'Clear difference visible', color: '#f97316' };
  return { level: 'Very Different', description: 'Obvious color mismatch', color: '#ef4444' };
}

/**
 * Compute Delta E between two RGB colors through full color space conversion
 */
export function computeDeltaEFromRGB(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
  method: '76' | '94' | '2000' = '2000'
): { lab1: LabColor; lab2: LabColor; deltaE: number; interpretation: ReturnType<typeof interpretDeltaE> } {
  // Convert both to XYZ (using sRGB as reference)
  const xyz1 = rgbToXYZ(r1, g1, b1, 'sRGB', 'sRGB');
  const xyz2 = rgbToXYZ(r2, g2, b2, 'sRGB', 'sRGB');
  // Convert to Lab
  const lab1 = xyzToLab(xyz1.X, xyz1.Y, xyz1.Z);
  const lab2 = xyzToLab(xyz2.X, xyz2.Y, xyz2.Z);
  // Compute Delta E
  let dE: number;
  switch (method) {
    case '76': dE = deltaE76(lab1, lab2); break;
    case '94': dE = deltaE94(lab1, lab2); break;
    case '2000': dE = deltaE2000(lab1, lab2); break;
  }
  return { lab1, lab2, deltaE: dE, interpretation: interpretDeltaE(dE) };
}

/**
 * Calculate statistics for a set of Delta E values
 */
export function deltaEStatistics(values: number[]): {
  mean: number;
  median: number;
  max: number;
  min: number;
  stdDev: number;
  p95: number;
  p99: number;
} {
  if (values.length === 0) return { mean: 0, median: 0, max: 0, min: 0, stdDev: 0, p95: 0, p99: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((s, v) => s + v, 0);
  const mean = sum / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const percentile = (p: number) => {
    const idx = Math.ceil(p / 100 * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  };

  return {
    mean,
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
    min: sorted[0],
    stdDev,
    p95: percentile(95),
    p99: percentile(99),
  };
}
