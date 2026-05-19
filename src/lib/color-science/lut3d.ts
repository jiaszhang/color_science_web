/**
 * 3D LUT (Look-Up Table) operations
 * Supports creation, application, import/export (.cube format), interpolation
 */

import { type Vec3, clampVec3 } from './matrices';
import { convertColorSpace, type TransferFunctionName } from './transform';

export interface LUT3D {
  name: string;
  size: number; // Grid size per axis (e.g., 33, 65)
  data: Float32Array; // Flat array: [R0,G0,B0, R1,G1,B1, ...]
  inputRange: { min: number; max: number };
  outputRange: { min: number; max: number };
  title?: string;
  srcGamut?: string;
  dstGamut?: string;
}

/**
 * Create an empty 3D LUT (identity)
 */
export function createLUT3D(size: number, name = 'Identity LUT'): LUT3D {
  const totalEntries = size * size * size;
  const data = new Float32Array(totalEntries * 3);

  let idx = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rv = r / (size - 1);
        const gv = g / (size - 1);
        const bv = b / (size - 1);
        data[idx++] = rv;
        data[idx++] = gv;
        data[idx++] = bv;
      }
    }
  }

  return {
    name,
    size,
    data,
    inputRange: { min: 0, max: 1 },
    outputRange: { min: 0, max: 1 },
  };
}

/**
 * Create a 3D LUT from a color space conversion function
 */
export function createLUT3DFromTransform(
  size: number,
  name: string,
  transform: (r: number, g: number, b: number) => Vec3,
  srcGamut?: string,
  dstGamut?: string
): LUT3D {
  const totalEntries = size * size * size;
  const data = new Float32Array(totalEntries * 3);

  let idx = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rv = r / (size - 1);
        const gv = g / (size - 1);
        const bv = b / (size - 1);
        const [outR, outG, outB] = transform(rv, gv, bv);
        data[idx++] = outR;
        data[idx++] = outG;
        data[idx++] = outB;
      }
    }
  }

  return {
    name,
    size,
    data,
    inputRange: { min: 0, max: 1 },
    outputRange: { min: 0, max: 1 },
    srcGamut,
    dstGamut,
  };
}

/**
 * Create a color space conversion LUT
 */
export function createColorSpaceLUT(
  size: number,
  srcGamut: string,
  srcTF: TransferFunctionName,
  dstGamut: string,
  dstTF: TransferFunctionName
): LUT3D {
  const name = `${srcGamut} → ${dstGamut}`;
  return createLUT3DFromTransform(size, name, (r, g, b) => {
    return convertColorSpace(r, g, b, srcGamut, srcTF, dstGamut, dstTF);
  }, srcGamut, dstGamut);
}

/**
 * Trilinear interpolation on a 3D LUT
 */
export function applyLUT3D(lut: LUT3D, r: number, g: number, b: number): Vec3 {
  const size = lut.size;
  const { min, max } = lut.inputRange;
  const range = max - min;

  // Normalize input to grid coordinates
  const nr = (clampVec3([r, g, b], min, max)[0] - min) / range;
  const ng = (clampVec3([r, g, b], min, max)[1] - min) / range;
  const nb = (clampVec3([r, g, b], min, max)[2] - min) / range;

  // Scale to grid indices
  const gridR = nr * (size - 1);
  const gridG = ng * (size - 1);
  const gridB = nb * (size - 1);

  // Floor indices
  const r0 = Math.floor(gridR);
  const g0 = Math.floor(gridG);
  const b0 = Math.floor(gridB);

  // Fractional parts
  const fr = gridR - r0;
  const fg = gridG - g0;
  const fb = gridB - b0;

  // Clamp upper indices
  const r1 = Math.min(r0 + 1, size - 1);
  const g1 = Math.min(g0 + 1, size - 1);
  const b1 = Math.min(b0 + 1, size - 1);

  // Helper to get LUT value at grid point
  const getVal = (ri: number, gi: number, bi: number, ch: number): number => {
    const idx = (bi * size * size + gi * size + ri) * 3 + ch;
    return lut.data[idx];
  };

  // Trilinear interpolation
  const result: Vec3 = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const c000 = getVal(r0, g0, b0, ch);
    const c100 = getVal(r1, g0, b0, ch);
    const c010 = getVal(r0, g1, b0, ch);
    const c110 = getVal(r1, g1, b0, ch);
    const c001 = getVal(r0, g0, b1, ch);
    const c101 = getVal(r1, g0, b1, ch);
    const c011 = getVal(r0, g1, b1, ch);
    const c111 = getVal(r1, g1, b1, ch);

    const c00 = c000 * (1 - fr) + c100 * fr;
    const c10 = c010 * (1 - fr) + c110 * fr;
    const c01 = c001 * (1 - fr) + c101 * fr;
    const c11 = c011 * (1 - fr) + c111 * fr;

    const c0 = c00 * (1 - fg) + c10 * fg;
    const c1 = c01 * (1 - fg) + c11 * fg;

    result[ch] = c0 * (1 - fb) + c1 * fb;
  }

  return result;
}

/**
 * Combine (chain) two 3D LUTs: first lut1, then lut2
 * Creates a new identity-sized LUT with combined transform
 */
export function chainLUTs(lut1: LUT3D, lut2: LUT3D, size = 33): LUT3D {
  return createLUT3DFromTransform(
    size,
    `${lut1.name} → ${lut2.name}`,
    (r, g, b) => {
      const [r1, g1, b1] = applyLUT3D(lut1, r, g, b);
      return applyLUT3D(lut2, r1, g1, b1);
    }
  );
}

/**
 * Export LUT to .cube format string
 */
export function exportLUTToCube(lut: LUT3D): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Created by Color Pipeline`);
  lines.push(`TITLE "${lut.name}"`);
  if (lut.srcGamut) lines.push(`# Source: ${lut.srcGamut}`);
  if (lut.dstGamut) lines.push(`# Target: ${lut.dstGamut}`);
  lines.push(`DOMAIN_MIN ${lut.inputRange.min} ${lut.inputRange.min} ${lut.inputRange.min}`);
  lines.push(`DOMAIN_MAX ${lut.inputRange.max} ${lut.inputRange.max} ${lut.inputRange.max}`);
  lines.push(`LUT_3D_SIZE ${lut.size}`);
  lines.push('');

  // Data
  const size = lut.size;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const idx = (b * size * size + g * size + r) * 3;
        const rv = clampVec3([lut.data[idx], lut.data[idx + 1], lut.data[idx + 2]], 0, 1);
        lines.push(`${rv[0].toFixed(6)} ${rv[1].toFixed(6)} ${rv[2].toFixed(6)}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * CSV 3DLUT import options
 */
export interface CSVLutOptions {
  /** Bit depth of the integer values in the CSV (8, 10, 12, 14, 16, etc.) */
  bitDepth: number;
  /**
   * Data ordering of the CSV rows:
   * - 'rgb': RGB increment — R changes slowest (outer), G middle, B fastest (inner)
   *          line_index = R * size² + G * size + B
   * - 'bgr': BGR increment — B changes slowest (outer), G middle, R fastest (inner)
   *          line_index = B * size² + G * size + R
   *          (identical to .cube format layout, no reorder needed)
   */
  order: 'rgb' | 'bgr';
  /** Optional LUT name */
  name?: string;
}

/**
 * Parse a CSV format 3D LUT file
 *
 * CSV format: each line has 3 comma-separated integer RGB values.
 * The grid size is auto-detected as the cube root of the line count.
 *
 * Reorder logic for 'rgb' order (matching GMP3dlutOutputReorder):
 *   Source (RGB increment): src[lineIdx] corresponds to grid point (R, G, B)
 *     where lineIdx = R * size² + G * size + B
 *   Destination (internal / .cube format): dst[(B * size² + G * size + R)] = src[lineIdx]
 *     i.e., B outer, G middle, R inner
 *
 * This is equivalent to the C reorder function:
 *   for (b) for (g=size;g>0;g--) for (r=1;r<=size;r++)
 *     index = size²*r - size*g + b    →  R*size² + G*size + B  (source)
 *     output[i++] = source[index]      →  B outer, G middle, R inner (dest)
 *
 * The internal format matches applyLUT3D's lookup:
 *   getVal(ri, gi, bi, ch) → data[(bi * size² + gi * size + ri) * 3 + ch]
 */
export function parseCSVLut(content: string, options: CSVLutOptions): LUT3D {
  const { bitDepth, order, name: lutName } = options;
  const maxVal = Math.pow(2, bitDepth) - 1;

  // Split lines and parse
  const lines = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    throw new Error('CSV 文件为空');
  }

  // Auto-detect grid size from line count
  const totalEntries = lines.length;
  const size = Math.round(Math.cbrt(totalEntries));

  if (Math.pow(size, 3) !== totalEntries) {
    throw new Error(
      `行数 ${totalEntries} 不是完全立方数。最近的立方数: ${size}³ = ${Math.pow(size, 3)}`
    );
  }

  if (size < 2 || size > 256) {
    throw new Error(`网格大小 ${size} 不在有效范围 (2-256) 内`);
  }

  // Parse all lines into flat arrays (normalized 0-1)
  const rawR = new Float32Array(totalEntries);
  const rawG = new Float32Array(totalEntries);
  const rawB = new Float32Array(totalEntries);

  for (let i = 0; i < totalEntries; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 3) {
      throw new Error(`第 ${i + 1} 行格式错误: 期望 3 个逗号分隔的值，实际 ${parts.length} 个`);
    }
    const rv = parseFloat(parts[0].trim());
    const gv = parseFloat(parts[1].trim());
    const bv = parseFloat(parts[2].trim());
    if (isNaN(rv) || isNaN(gv) || isNaN(bv)) {
      throw new Error(`第 ${i + 1} 行包含非数值`);
    }
    rawR[i] = rv / maxVal;
    rawG[i] = gv / maxVal;
    rawB[i] = bv / maxVal;
  }

  // Build LUT data in internal format: idx = (b * size * size + g * size + r) * 3
  // This layout matches applyLUT3D's getVal: data[(bi*size² + gi*size + ri)*3 + ch]
  const data = new Float32Array(totalEntries * 3);

  for (let lineIdx = 0; lineIdx < totalEntries; lineIdx++) {
    let r: number, g: number, b: number;

    if (order === 'rgb') {
      // RGB increment: source lineIdx = R * size² + G * size + B
      // → R outer (slowest), G middle, B inner (fastest)
      r = Math.floor(lineIdx / (size * size));
      g = Math.floor((lineIdx % (size * size)) / size);
      b = lineIdx % size;
      // Reorder to internal format: dstIdx = B * size² + G * size + R
      // (B outer, G middle, R inner — matching .cube / applyLUT3D layout)
    } else {
      // BGR increment: source lineIdx = B * size² + G * size + R
      // → B outer, G middle, R inner (already matches internal format, no reorder)
      b = Math.floor(lineIdx / (size * size));
      g = Math.floor((lineIdx % (size * size)) / size);
      r = lineIdx % size;
    }

    const dstIdx = (b * size * size + g * size + r) * 3;
    data[dstIdx] = rawR[lineIdx];
    data[dstIdx + 1] = rawG[lineIdx];
    data[dstIdx + 2] = rawB[lineIdx];
  }

  return {
    name: lutName || `CSV LUT ${size}³`,
    size,
    data,
    inputRange: { min: 0, max: 1 },
    outputRange: { min: 0, max: 1 },
  };
}

/**
 * Parse a .cube format LUT file
 */
export function parseCubeFile(content: string, dataOrder: 'bgr' | 'rgb' = 'bgr'): LUT3D {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  let size = 33;
  let name = 'Imported LUT';
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];
  let dataStartIdx = 0;

  // Parse header
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toUpperCase().startsWith('TITLE')) {
      name = line.match(/"([^"]+)"/)?.[1] || name;
    } else if (line.toUpperCase().startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1]);
    } else if (line.toUpperCase().startsWith('DOMAIN_MIN')) {
      domainMin = line.split(/\s+/).slice(1).map(Number);
    } else if (line.toUpperCase().startsWith('DOMAIN_MAX')) {
      domainMax = line.split(/\s+/).slice(1).map(Number);
    } else {
      // Check if this is the start of data (3 numbers)
      const parts = line.split(/\s+/);
      if (parts.length === 3 && parts.every(p => !isNaN(Number(p)))) {
        dataStartIdx = i;
        break;
      }
    }
  }

  // Parse raw data lines into separate arrays first
  const totalEntries = size * size * size;
  const rawR = new Float32Array(totalEntries);
  const rawG = new Float32Array(totalEntries);
  const rawB = new Float32Array(totalEntries);
  let dataIdx = 0;

  for (let i = dataStartIdx; i < lines.length && dataIdx < totalEntries; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length >= 3) {
      rawR[dataIdx] = parseFloat(parts[0]);
      rawG[dataIdx] = parseFloat(parts[1]);
      rawB[dataIdx] = parseFloat(parts[2]);
      dataIdx++;
    }
  }

  // Build internal data array: index = (b * size² + g * size + r) * 3
  const data = new Float32Array(totalEntries * 3);

  if (dataOrder === 'bgr') {
    // Standard .cube: B outer, G middle, R inner — already matches internal layout
    for (let lineIdx = 0; lineIdx < totalEntries; lineIdx++) {
      const idx = lineIdx * 3;
      data[idx] = rawR[lineIdx];
      data[idx + 1] = rawG[lineIdx];
      data[idx + 2] = rawB[lineIdx];
    }
  } else {
    // RGB order: R outer (slowest), G middle, B inner (fastest)
    // Source lineIdx = R * size² + G * size + B
    // Reorder to internal: dstIdx = B * size² + G * size + R
    for (let lineIdx = 0; lineIdx < totalEntries; lineIdx++) {
      const r = Math.floor(lineIdx / (size * size));
      const g = Math.floor((lineIdx % (size * size)) / size);
      const b = lineIdx % size;
      const dstIdx = (b * size * size + g * size + r) * 3;
      data[dstIdx] = rawR[lineIdx];
      data[dstIdx + 1] = rawG[lineIdx];
      data[dstIdx + 2] = rawB[lineIdx];
    }
  }

  return {
    name,
    size,
    data,
    inputRange: { min: domainMin[0], max: domainMax[0] },
    outputRange: { min: 0, max: 1 },
  };
}

/**
 * Apply LUT to ImageData (canvas pixel data)
 */
export function applyLUTToImageData(lut: LUT3D, imageData: ImageData): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );

  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i] / 255;
    const g = imageData.data[i + 1] / 255;
    const b = imageData.data[i + 2] / 255;

    const [or, og, ob] = applyLUT3D(lut, r, g, b);

    result.data[i] = Math.round(clampVec3([or, og, ob], 0, 1)[0] * 255);
    result.data[i + 1] = Math.round(clampVec3([or, og, ob], 0, 1)[1] * 255);
    result.data[i + 2] = Math.round(clampVec3([or, og, ob], 0, 1)[2] * 255);
    result.data[i + 3] = imageData.data[i + 3]; // Alpha
  }

  return result;
}

/**
 * Upsample a 3D LUT to a larger grid size using trilinear interpolation
 */
export function upsampleLUT(lut: LUT3D, newSize: number): LUT3D {
  return createLUT3DFromTransform(
    newSize,
    `${lut.name} [${newSize}³ 上采样]`,
    (r, g, b) => applyLUT3D(lut, r, g, b),
    lut.srcGamut,
    lut.dstGamut,
  );
}

/**
 * Adjust the output gamut/transfer-function of an existing LUT.
 * For each entry, the output RGB is re-interpreted from lut.dstGamut (or 'sRGB')
 * and converted into the requested newDstGamut + newDstTF.
 */
export function adjustLUTGamut(
  lut: LUT3D,
  newDstGamut: string,
  newDstTF: TransferFunctionName,
): LUT3D {
  const srcGamut = lut.dstGamut || 'sRGB';
  const srcTF: TransferFunctionName = 'sRGB';
  const size = lut.size;
  const totalEntries = size * size * size;
  const data = new Float32Array(totalEntries * 3);

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const idx = (b * size * size + g * size + r) * 3;
        const or = lut.data[idx];
        const og = lut.data[idx + 1];
        const ob = lut.data[idx + 2];
        const [nr, ng, nb] = convertColorSpace(or, og, ob, srcGamut, srcTF, newDstGamut, newDstTF);
        data[idx] = nr;
        data[idx + 1] = ng;
        data[idx + 2] = nb;
      }
    }
  }

  return {
    name: `${lut.name} → ${newDstGamut}`,
    size,
    data,
    inputRange: { min: 0, max: 1 },
    outputRange: { min: 0, max: 1 },
    srcGamut: lut.srcGamut,
    dstGamut: newDstGamut,
  };
}

/**
 * Get a 2D slice of the 3D LUT for visualization
 * @param lut - The 3D LUT
 * @param axis - Which axis to fix (0=R, 1=G, 2=B)
 * @param slicePos - Position on the fixed axis (0 to size-1)
 */
export function getLUTSlice(
  lut: LUT3D,
  axis: 0 | 1 | 2,
  slicePos: number
): { grid: number; index: number; rgb: Vec3 }[][] {
  const size = lut.size;
  const slice = Math.max(0, Math.min(size - 1, slicePos));
  const grid: { grid: number; index: number; rgb: Vec3 }[][] = [];

  for (let j = 0; j < size; j++) {
    const row: { grid: number; index: number; rgb: Vec3 }[] = [];
    for (let i = 0; i < size; i++) {
      let ri, gi, bi;
      if (axis === 0) { ri = slice; gi = i; bi = j; }
      else if (axis === 1) { ri = i; gi = slice; bi = j; }
      else { ri = i; gi = j; bi = slice; }

      const idx = (bi * size * size + gi * size + ri) * 3;
      row.push({
        grid: size,
        index: idx / 3,
        rgb: [lut.data[idx], lut.data[idx + 1], lut.data[idx + 2]],
      });
    }
    grid.push(row);
  }

  return grid;
}
