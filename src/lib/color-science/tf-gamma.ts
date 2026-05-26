/**
 * Transfer Functions and Gamma encoding/decoding
 * Supports: sRGB, Linear, Power Gamma, BT.1886, ST.2084 (PQ), HLG, BT.709
 */

export type TransferFunctionName =
  | 'linear'
  | 'sRGB'
  | 'gamma22'
  | 'gamma26'
  | 'gamma28'
  | 'bt1886'
  | 'st2084'
  | 'hlg'
  | 'bt709'
  | 'custom';

export interface TransferFunction {
  name: string;
  description: string;
  encode: (linear: number) => number;
  decode: (encoded: number) => number;
}

export const TRANSFER_FUNCTIONS: Record<TransferFunctionName, TransferFunction> = {
  linear: {
    name: 'Linear',
    description: 'Linear light (no transfer function)',
    encode: (v) => v,
    decode: (v) => v,
  },

  sRGB: {
    name: 'sRGB',
    description: 'sRGB transfer function (~gamma 2.2 with linear segment)',
    encode: (v) => {
      if (v <= 0.0031308) return 12.92 * v;
      return 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    },
    decode: (v) => {
      if (v <= 0.04045) return v / 12.92;
      return Math.pow((v + 0.055) / 1.055, 2.4);
    },
  },

  bt709: {
    name: 'BT.709',
    description: 'ITU-R BT.709 transfer function',
    encode: (v) => {
      if (v < 0.018) return 4.500 * v;
      return 1.099 * Math.pow(v, 0.45) - 0.099;
    },
    decode: (v) => {
      if (v < 0.081) return v / 4.500;
      return Math.pow((v + 0.099) / 1.099, 1 / 0.45);
    },
  },

  gamma22: {
    name: 'Gamma 2.2',
    description: 'Simple power gamma 2.2',
    encode: (v) => Math.pow(Math.max(0, v), 1 / 2.2),
    decode: (v) => Math.pow(Math.max(0, v), 2.2),
  },

  gamma26: {
    name: 'Gamma 2.6',
    description: 'Simple power gamma 2.6',
    encode: (v) => Math.pow(Math.max(0, v), 1 / 2.6),
    decode: (v) => Math.pow(Math.max(0, v), 2.6),
  },

  gamma28: {
    name: 'Gamma 2.8',
    description: 'Simple power gamma 2.8 (old CRT)',
    encode: (v) => Math.pow(Math.max(0, v), 1 / 2.8),
    decode: (v) => Math.pow(Math.max(0, v), 2.8),
  },

  bt1886: {
    name: 'BT.1886',
    description: 'Reference EOTF for flat panel displays',
    encode: (v) => Math.pow(Math.max(0, v), 1 / 2.4),
    decode: (v) => Math.pow(Math.max(0, v), 2.4),
  },

  st2084: {
    name: 'ST.2084 (PQ)',
    description: 'SMPTE ST.2084 Perceptual Quantizer (HDR)',
    encode: (v) => {
      // Linear to PQ
      const L = Math.max(0, v);
      const c1 = 0.8359375;
      const c2 = 18.8515625;
      const c3 = 18.6875;
      const m1 = 0.1593017578125;
      const m2 = 78.84375;
      const n = Math.pow(L, m1);
      return Math.pow((c1 + c2 * n) / (1 + c3 * n), m2);
    },
    decode: (v) => {
      // PQ to Linear (0-10000 nits)
      const V = Math.max(0, Math.min(1, v));
      const c1 = 0.8359375;
      const c2 = 18.8515625;
      const c3 = 18.6875;
      const m1 = 0.1593017578125;
      const m2 = 78.84375;
      const n = Math.pow(V, 1 / m2);
      const L = Math.pow(Math.max(0, n - c1) / (c2 - c3 * n), 1 / m1);
      return L;
    },
  },

  hlg: {
    name: 'HLG',
    description: 'Hybrid Log-Gamma (HDR)',
    encode: (v) => {
      const a = 0.17883277;
      const b = 1 - 4 * a;
      const c = 0.5 - a * Math.log(4 * a);
      const L = Math.max(0, v);
      if (L <= 1 / 12) {
        return Math.sqrt(3 * L);
      }
      return a * Math.log(12 * L - b) + c;
    },
    decode: (v) => {
      const a = 0.17883277;
      const b = 1 - 4 * a;
      const c = 0.5 - a * Math.log(4 * a);
      const V = Math.max(0, v);
      if (V <= 0.5) {
        return (V * V) / 3;
      }
      return Math.exp((V - c) / a + b) / 12;
    },
  },

  custom: {
    name: 'Custom Power',
    description: 'Custom power gamma curve',
    encode: (v) => v, // Will be overridden
    decode: (v) => v, // Will be overridden
  },
};

/** Get transfer function names */
export function getTransferFunctionNames(): TransferFunctionName[] {
  return Object.keys(TRANSFER_FUNCTIONS) as TransferFunctionName[];
}

/** Encode linear value using specified transfer function */
export function encodeTF(value: number, tf: TransferFunctionName, gamma = 2.2): number {
  if (tf === 'custom') {
    return Math.pow(Math.max(0, value), 1 / gamma);
  }
  return TRANSFER_FUNCTIONS[tf].encode(value);
}

/** Decode value using specified transfer function */
export function decodeTF(value: number, tf: TransferFunctionName, gamma = 2.2): number {
  if (tf === 'custom') {
    return Math.pow(Math.max(0, value), gamma);
  }
  return TRANSFER_FUNCTIONS[tf].decode(value);
}

/** Generate curve data for visualization */
export function generateCurveData(
  tf: TransferFunctionName,
  gamma = 2.2,
  numPoints = 256
): { input: number; output: number }[] {
  const points: { input: number; output: number }[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const input = i / numPoints;
    let output: number;
    if (tf === 'st2084') {
      // Normalize PQ to 0-1 range for display
      output = TRANSFER_FUNCTIONS[tf].encode(input);
      // PQ range is 0-1 mapped to 0-10000 nits
    } else if (tf === 'custom') {
      output = Math.pow(Math.max(0, input), 1 / gamma);
    } else {
      output = TRANSFER_FUNCTIONS[tf].encode(input);
    }
    points.push({ input, output: Math.max(0, Math.min(1, output)) });
  }
  return points;
}

/** Generate multiple curves for comparison */
export function generateMultipleCurves(
  tfs: { name: string; tf: TransferFunctionName; gamma?: number }[],
  numPoints = 256
): { input: number; [key: string]: number }[] {
  const points: { input: number; [key: string]: number }[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const input = i / numPoints;
    const point: { input: number; [key: string]: number } = { input };
    for (const { name, tf, gamma } of tfs) {
      point[name] = Math.max(0, Math.min(1, encodeTF(input, tf, gamma)));
    }
    points.push(point);
  }
  return points;
}
