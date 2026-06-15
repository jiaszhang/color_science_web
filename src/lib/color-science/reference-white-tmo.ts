/**
 * Reference White Tone Mapping Operator (TMO)
 * Based on ST.2084 (PQ) EOTF and the Reference White TMO algorithm.
 *
 * Translates the Python/Tkinter implementation into TypeScript for
 * use in the ColorPipeline web application.
 */

// =============== PQ / sRGB 工具函数 ===============

/**
 * ST.2084 (PQ) EOTF: E ∈ [0,1] -> L ∈ [0,10000] cd/m²
 */
export function pqEotf(E: Float32Array): Float32Array {
  const m1 = (2610.0 / 4096.0) / 4.0;
  const m2 = (2523.0 / 4096.0) * 128.0;
  const c1 = 3424.0 / 4096.0;
  const c2 = (2413.0 / 4096.0) * 32.0;
  const c3 = (2392.0 / 4096.0) * 32.0;

  const n = E.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let tmp = Math.max(0, Math.min(1, E[i]));
    tmp = Math.pow(tmp, 1.0 / m2);
    tmp = Math.max(0, tmp - c1) / (c2 - c3 * tmp);
    tmp = Math.pow(tmp, 1.0 / m1) * 10000.0;
    out[i] = Math.max(0, Math.min(10000, tmp));
  }
  return out;
}

/**
 * sRGB OETF (opto-electronic transfer function): linear [0,1] -> gamma [0,1]
 */
export function srgbEncode(linear: Float32Array): Float32Array {
  const n = linear.length;
  const out = new Float32Array(n);
  const a = 0.055;
  const threshold = 0.0031308;
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(1, linear[i]));
    out[i] = v <= threshold
      ? 12.92 * v
      : (1 + a) * Math.pow(v, 1 / 2.4) - a;
    out[i] = Math.max(0, Math.min(1, out[i]));
  }
  return out;
}

// =============== TMO Core ===============

export interface TMOParams {
  sourceImagePeak: number;              // metadata_Lc
  sourceImageReferenceWhite: number;    // metadata_Lw
  mappingTargetReferenceWhite: number;
  mappingTargetPeak: number;
  sdrExposureAnchor: number;
  minimumSdrExposure: number;
  offsetAnchor: number;
}

export interface TMOExposureResult {
  outputExposure: number;
  sourceImageHeadroom: number;
  mappingTargetHeadroom: number;
}

/**
 * Compute exposure parameters from TMO metadata
 */
export function computeExposureParams(params: TMOParams): TMOExposureResult {
  const {
    sourceImagePeak,
    sourceImageReferenceWhite,
    mappingTargetReferenceWhite,
    mappingTargetPeak,
    sdrExposureAnchor,
    minimumSdrExposure,
    offsetAnchor,
  } = params;

  const sourceImageHeadroom = Math.max(
    sourceImagePeak / sourceImageReferenceWhite,
    mappingTargetPeak / mappingTargetReferenceWhite
  );
  const mappingTargetHeadroom = Math.min(
    mappingTargetPeak / mappingTargetReferenceWhite,
    sourceImageHeadroom
  );

  const sdrExposure =
    1 -
    Math.min((sourceImageHeadroom - 1) / (sdrExposureAnchor - 1), 1) *
      (1 - minimumSdrExposure);
  const exposureOffset =
    (1 - minimumSdrExposure) / (offsetAnchor - 1);

  const outputExposure = Math.min(
    sdrExposure + exposureOffset * (mappingTargetHeadroom - 1),
    1
  );

  return { outputExposure, sourceImageHeadroom, mappingTargetHeadroom };
}

/**
 * Reference White Tone Curve
 * x: max(Rnorm, Gnorm, Bnorm) normalized input
 * Returns TC(x) — the tone-mapped output value
 */
export function rwToneCurve(
  outputExposure: number,
  sourceImageHeadroom: number,
  x: Float32Array,
  mappingTargetHeadroom: number
): Float32Array {
  const TC_x = new Float32Array(x.length);

  const p1_x = mappingTargetHeadroom / outputExposure;
  const a_0 = 1 + sourceImageHeadroom - 2 * p1_x;
  const min_a = 0.001 * mappingTargetHeadroom / 3.0;
  let p2_x: number;
  if (Math.abs(a_0) <= min_a) {
    p2_x = sourceImageHeadroom + min_a - a_0;
  } else {
    p2_x = sourceImageHeadroom;
  }
  const a = 1 + p2_x - 2 * p1_x;
  const b = p1_x * p1_x - p2_x;
  const c = 1 - p1_x;

  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    if (xi > 0 && xi <= 1) {
      // slope1: linear
      TC_x[i] = xi * outputExposure;
    } else if (xi > 1 && xi <= sourceImageHeadroom) {
      // slope2: Bezier quadratic
      const t = (Math.sqrt(a * xi + b) + c) / a;
      const d = outputExposure - mappingTargetHeadroom;
      TC_x[i] = outputExposure + d * (t - 2) * t;
    } else if (xi > sourceImageHeadroom) {
      // slope3: clip
      TC_x[i] = mappingTargetHeadroom;
    } else {
      TC_x[i] = 0;
    }
  }
  return TC_x;
}

/**
 * Apply the Reference White TMO to an HDR linear RGB image
 *
 * @param hdrLinearRgb - HxWx3 Float32Array of HDR linear RGB values (cd/m²)
 * @param params - TMO parameters
 * @returns { rgb_tmo, exposureResult } - Tone-mapped linear RGB in [0,1] range
 */
export function referenceWhiteTmo(
  hdrLinearRgb: Float32Array,
  width: number,
  height: number,
  params: TMOParams
): { rgbTmo: Float32Array; exposureResult: TMOExposureResult } {
  const { sourceImageReferenceWhite } = params;

  const exposureResult = computeExposureParams(params);
  const { outputExposure, sourceImageHeadroom, mappingTargetHeadroom } = exposureResult;

  const pixelCount = width * height;
  const rgbNorm = new Float32Array(pixelCount * 3);
  for (let i = 0; i < pixelCount * 3; i++) {
    rgbNorm[i] = hdrLinearRgb[i] / sourceImageReferenceWhite;
  }

  // Compute x = (max(Y_in, eps) + x_max) / 2
  const x = new Float32Array(pixelCount);
  const eps = 1e-6;
  for (let i = 0; i < pixelCount; i++) {
    const r = rgbNorm[i * 3];
    const g = rgbNorm[i * 3 + 1];
    const b = rgbNorm[i * 3 + 2];
    const xMax = Math.max(r, g, b);
    const Y_in = 0.2627 * b + 0.6780 * g + 0.0593 * r;
    x[i] = (Math.max(Y_in, eps) + xMax) / 2.0;
  }

  // Apply tone curve
  const TC_x = rwToneCurve(outputExposure, sourceImageHeadroom, x, mappingTargetHeadroom);

  // Compute gain and apply
  const rgbTmo = new Float32Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    const gain = x[i] > 0 ? TC_x[i] / x[i] : 0;
    rgbTmo[i * 3] = rgbNorm[i * 3] * gain;
    rgbTmo[i * 3 + 1] = rgbNorm[i * 3 + 1] * gain;
    rgbTmo[i * 3 + 2] = rgbNorm[i * 3 + 2] * gain;
  }

  return { rgbTmo, exposureResult };
}

/**
 * Generate tone curve data for plotting
 * Returns arrays of (x, y) pairs suitable for chart rendering
 */
export function generateToneCurveData(
  params: TMOParams,
  numPoints: number = 500
): { x: number[]; y: number[] } {
  const exposureResult = computeExposureParams(params);
  const { outputExposure, sourceImageHeadroom, mappingTargetHeadroom } = exposureResult;

  const headroom = Math.max(sourceImageHeadroom, 1.0);
  const xArr = new Float32Array(numPoints);
  for (let i = 0; i < numPoints; i++) {
    xArr[i] = (i / (numPoints - 1)) * headroom;
  }

  const yArr = rwToneCurve(outputExposure, sourceImageHeadroom, xArr, mappingTargetHeadroom);

  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < numPoints; i++) {
    xs.push(xArr[i]);
    ys.push(yArr[i]);
  }

  return { x: xs, y: ys };
}

/**
 * Full pipeline: load PQ image pixels, apply TMO, output sRGB bytes
 *
 * @param pqPixels - Uint16Array or Float32Array of PQ-encoded pixel values (BGR or RGB depending on isBgr)
 * @param width - Image width
 * @param height - Image height
 * @param params - TMO parameters
 * @param isBgr - If true, input is BGR order (from cv2.imread); if false, RGB
 * @param downsampleFactor - Downsample factor (1 = no downsample)
 * @returns { outputRgba, processedWidth, processedHeight, exposureResult }
 */
export function processHDRImage(
  pqPixels: Uint16Array | Float32Array | Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  params: TMOParams,
  isBgr: boolean = true,
  downsampleFactor: number = 1
): {
  outputRgba: Uint8ClampedArray;
  processedWidth: number;
  processedHeight: number;
  exposureResult: TMOExposureResult;
} {
  // Determine normalization factor
  let maxNum = 65535.0;
  if (pqPixels instanceof Float32Array) maxNum = 1.0;
  else if (pqPixels instanceof Uint8Array || pqPixels instanceof Uint8ClampedArray) maxNum = 255.0;

  // Downsample if needed
  let procW = width;
  let procH = height;
  let rgbPixels: Float32Array; // HxWx3 in RGB order

  if (downsampleFactor > 1) {
    procW = Math.max(1, Math.floor(width / downsampleFactor));
    procH = Math.max(1, Math.floor(height / downsampleFactor));
    rgbPixels = new Float32Array(procW * procH * 3);

    for (let py = 0; py < procH; py++) {
      for (let px = 0; px < procW; px++) {
        const srcX = Math.min(px * downsampleFactor, width - 1);
        const srcY = Math.min(py * downsampleFactor, height - 1);
        const srcIdx = (srcY * width + srcX) * 3;
        const dstIdx = (py * procW + px) * 3;

        if (isBgr) {
          rgbPixels[dstIdx] = pqPixels[srcIdx + 2] / maxNum;     // R
          rgbPixels[dstIdx + 1] = pqPixels[srcIdx + 1] / maxNum; // G
          rgbPixels[dstIdx + 2] = pqPixels[srcIdx] / maxNum;     // B
        } else {
          rgbPixels[dstIdx] = pqPixels[srcIdx] / maxNum;
          rgbPixels[dstIdx + 1] = pqPixels[srcIdx + 1] / maxNum;
          rgbPixels[dstIdx + 2] = pqPixels[srcIdx + 2] / maxNum;
        }
      }
    }
  } else {
    rgbPixels = new Float32Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      if (isBgr) {
        rgbPixels[i * 3] = pqPixels[i * 3 + 2] / maxNum;
        rgbPixels[i * 3 + 1] = pqPixels[i * 3 + 1] / maxNum;
        rgbPixels[i * 3 + 2] = pqPixels[i * 3] / maxNum;
      } else {
        rgbPixels[i * 3] = pqPixels[i * 3] / maxNum;
        rgbPixels[i * 3 + 1] = pqPixels[i * 3 + 1] / maxNum;
        rgbPixels[i * 3 + 2] = pqPixels[i * 3 + 2] / maxNum;
      }
    }
  }

  // PQ EOTF: normalized PQ signal -> linear luminance (cd/m²)
  const ePq = pqEotf(rgbPixels);

  // Apply TMO
  const { rgbTmo, exposureResult } = referenceWhiteTmo(ePq, procW, procH, params);

  // Clip to [0, 1]
  for (let i = 0; i < rgbTmo.length; i++) {
    rgbTmo[i] = Math.max(0, Math.min(1, rgbTmo[i]));
  }

  // sRGB encode
  const sdrSrgb = srgbEncode(rgbTmo);

  // Build RGBA output
  const pixelCount = procW * procH;
  const outputRgba = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    outputRgba[i * 4] = Math.round(sdrSrgb[i * 3] * 255 + 0.5);
    outputRgba[i * 4 + 1] = Math.round(sdrSrgb[i * 3 + 1] * 255 + 0.5);
    outputRgba[i * 4 + 2] = Math.round(sdrSrgb[i * 3 + 2] * 255 + 0.5);
    outputRgba[i * 4 + 3] = 255;
  }

  return { outputRgba, processedWidth: procW, processedHeight: procH, exposureResult };
}

/**
 * Generate a simple preview of the original HDR image (naive tone mapping for display)
 * Normalizes by peak luminance and applies sRGB encoding
 */
export function generateHDRPreview(
  hdrLinearRgb: Float32Array,
  width: number,
  height: number,
  maxPreviewSize: number = 512
): { dataUrl: string; previewWidth: number; previewHeight: number } {
  const L_max = hdrLinearRgb.reduce((max, v) => Math.max(max, v), 0);

  let procW = width;
  let procH = height;
  const scale = Math.min(maxPreviewSize / width, maxPreviewSize / height, 1.0);
  procW = Math.round(width * scale);
  procH = Math.round(height * scale);

  const normFactor = L_max > 0 ? L_max : 1.0;
  const pixelCount = procW * procH;
  const rgba = new Uint8ClampedArray(pixelCount * 4);

  for (let py = 0; py < procH; py++) {
    for (let px = 0; px < procW; px++) {
      const srcX = Math.min(Math.round(px / scale), width - 1);
      const srcY = Math.min(Math.round(py / scale), height - 1);
      const srcIdx = (srcY * width + srcX) * 3;
      const dstIdx = (py * procW + px) * 4;

      for (let c = 0; c < 3; c++) {
        let v = hdrLinearRgb[srcIdx + c] / normFactor;
        // sRGB encode
        v = Math.max(0, Math.min(1, v));
        const srgb = v <= 0.0031308
          ? 12.92 * v
          : (1.055) * Math.pow(v, 1 / 2.4) - 0.055;
        rgba[dstIdx + c] = Math.round(Math.max(0, Math.min(1, srgb)) * 255 + 0.5);
      }
      rgba[dstIdx + 3] = 255;
    }
  }

  // Use canvas to create data URL
  const canvas = document.createElement('canvas');
  canvas.width = procW;
  canvas.height = procH;
  const ctx = canvas.getContext('2d')!;
  const imageData = new ImageData(rgba, procW, procH);
  ctx.putImageData(imageData, 0, 0);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    previewWidth: procW,
    previewHeight: procH,
  };
}
