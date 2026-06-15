/**
 * Image Loader Utility — Raw Pixel Preservation
 *
 * When loading images into a browser canvas, the browser automatically applies
 * ICC color profile conversion (e.g., Display P3 → sRGB). This changes the
 * pixel values, which is incorrect for color science processing.
 *
 * This utility uses `createImageBitmap(blob, { colorSpaceConversion: 'none' })`
 * to load images WITHOUT ICC conversion, preserving the original pixel values
 * from the file. This is essential for:
 * - 16-bit images with wide-gamut ICC profiles (P3, Rec.2020, etc.)
 * - PQ/HLG-encoded HDR images
 * - Any image where raw pixel fidelity matters
 *
 * For 8-bit sRGB images (no ICC profile or sRGB profile), disabling color
 * space conversion has no visible effect — the pixel values remain the same.
 *
 * Extended format support:
 * - Browser-native formats (PNG, JPEG, WebP, GIF, BMP, AVIF): handled by createImageBitmap
 * - TIFF: converted to PNG via server-side sharp API
 * - EXR: decoded client-side by exr-decoder.ts
 */

import { decodeEXR, isEXRFileByName, isTIFFFile, needsServerConversion } from './exr-decoder';

export interface RawImageResult {
  /** Canvas containing raw (un-ICC-converted) pixel data */
  canvas: HTMLCanvasElement;
  /** 2D context of the canvas */
  ctx: CanvasRenderingContext2D;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Data URL for preview display (raw pixel values encoded as PNG) */
  dataUrl: string;
  /** For HDR images (EXR), the float pixel data is preserved */
  floatData?: Float32Array;
  /** Max pixel value in the image (for HDR info) */
  maxValue?: number;
  /** Original file format detected at load time */
  originalFormat?: string;
}

// Common accept attribute string for all supported image formats
export const IMAGE_ACCEPT_STRING = 'image/*,.exr,.tiff,.tif';

/**
 * Load a TIFF file via the server-side conversion API.
 */
async function loadTiffViaApi(file: File | Blob, maxDim: number = 0): Promise<RawImageResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('action', 'import');

  const response = await fetch('/api/image-convert', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Server error' }));
    throw new Error(err.error || `Server conversion failed: ${response.status}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Server conversion failed');
  }

  const { dataUrl, width, height, originalFormat } = result.data;

  // If maxDim is set, we need to resize
  if (maxDim > 0 && (width > maxDim || height > maxDim)) {
    return loadFromDataUrlWithMaxDim(dataUrl, maxDim, originalFormat);
  }

  // Create canvas from the returned data URL
  const img = await loadImageElement(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);

  return { canvas, ctx, width: img.width, height: img.height, dataUrl, originalFormat };
}

/**
 * Load an EXR file using the client-side decoder.
 */
async function loadExrFile(file: File | Blob, maxDim: number = 0): Promise<RawImageResult> {
  const buffer = await file.arrayBuffer();
  const result = await decodeEXR(buffer);

  let targetWidth = result.width;
  let targetHeight = result.height;

  // Optional downscale
  if (maxDim > 0) {
    const scale = Math.min(maxDim / result.width, maxDim / result.height, 1);
    targetWidth = Math.round(result.width * scale);
    targetHeight = Math.round(result.height * scale);
  }

  // Create canvas from decoded data
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  if (targetWidth === result.width && targetHeight === result.height) {
    // Direct write
    const imgData = new ImageData(result.uint8Data, result.width, result.height);
    ctx.putImageData(imgData, 0, 0);
  } else {
    // Downscale: first write at full res, then scale
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = result.width;
    fullCanvas.height = result.height;
    const fullCtx = fullCanvas.getContext('2d')!;
    fullCtx.putImageData(new ImageData(result.uint8Data, result.width, result.height), 0, 0);
    ctx.drawImage(fullCanvas, 0, 0, targetWidth, targetHeight);
  }

  const dataUrl = canvas.toDataURL('image/png');

  return {
    canvas,
    ctx,
    width: targetWidth,
    height: targetHeight,
    dataUrl,
    floatData: result.floatData,
    maxValue: result.maxValue,
    originalFormat: 'exr',
  };
}

/**
 * Helper: load an Image element from a data URL.
 */
function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image from data URL'));
    img.src = dataUrl;
  });
}

/**
 * Helper: load from a data URL with optional max dimension.
 */
async function loadFromDataUrlWithMaxDim(
  dataUrl: string,
  maxDim: number,
  originalFormat?: string
): Promise<RawImageResult> {
  const img = await loadImageElement(dataUrl);
  let w = img.width;
  let h = img.height;

  if (maxDim > 0) {
    const scale = Math.min(maxDim / w, maxDim / h, 1);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const outDataUrl = canvas.toDataURL('image/png');

  return { canvas, ctx, width: w, height: h, dataUrl: outDataUrl, originalFormat };
}

/**
 * Load an image file without browser ICC color conversion.
 *
 * Supports browser-native formats (PNG, JPEG, WebP, etc.) as well as
 * TIFF (via server-side conversion) and EXR (via client-side decoder).
 *
 * Uses `createImageBitmap({ colorSpaceConversion: 'none' })` to prevent
 * the browser from converting the image's color space to sRGB.
 * Falls back to traditional Image loading if createImageBitmap is unavailable.
 *
 * @param file - The File or Blob to load
 * @param maxDim - Optional max dimension for downscaling (0 = no limit)
 * @returns RawImageResult with canvas, context, dimensions, and preview data URL
 */
export async function loadImageRaw(
  file: File | Blob,
  maxDim: number = 0
): Promise<RawImageResult> {
  // ─── Handle EXR format (client-side decoder) ──────────────────────────
  if (file instanceof File && isEXRFileByName(file)) {
    return loadExrFile(file, maxDim);
  }

  // ─── Handle TIFF format (server-side conversion) ─────────────────────
  if (file instanceof File && isTIFFFile(file)) {
    return loadTiffViaApi(file, maxDim);
  }

  // ─── Handle browser-native formats ───────────────────────────────────
  // Try createImageBitmap with colorSpaceConversion: 'none' first
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { colorSpaceConversion: 'none' });
      let w = bitmap.width;
      let h = bitmap.height;

      // Optional downscale
      if (maxDim > 0) {
        const scale = Math.min(maxDim / w, maxDim / h, 1);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close(); // free the bitmap resource

      const dataUrl = canvas.toDataURL('image/png');

      // Detect original format from File type
      let originalFormat: string | undefined;
      if (file instanceof File) {
        if (file.type === 'image/jpeg') originalFormat = 'jpeg';
        else if (file.type === 'image/webp') originalFormat = 'webp';
        else if (file.type === 'image/png') originalFormat = 'png';
        else if (file.type === 'image/avif') originalFormat = 'avif';
        else if (file.type === 'image/bmp') originalFormat = 'bmp';
      }

      return { canvas, ctx, width: w, height: h, dataUrl, originalFormat };
    } catch {
      // Fall through to legacy path
    }
  }

  // Fallback: traditional Image loading (may apply ICC conversion)
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<RawImageResult>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;

        if (maxDim > 0) {
          const scale = Math.min(maxDim / w, maxDim / h, 1);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/png');
        resolve({ canvas, ctx, width: w, height: h, dataUrl });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Load an image from a URL (data URL or blob URL) without ICC conversion.
 *
 * This first fetches the URL to get a Blob, then uses loadImageRaw.
 * Needed for cases where we only have a URL string (e.g., previously created blob URLs).
 *
 * @param url - Data URL or blob URL to load
 * @param maxDim - Optional max dimension for downscaling (0 = no limit)
 * @returns RawImageResult with canvas, context, dimensions, and preview data URL
 */
export async function loadImageUrlRaw(
  url: string,
  maxDim: number = 0
): Promise<RawImageResult> {
  // If it's a data URL, convert to Blob
  if (url.startsWith('data:')) {
    const res = await fetch(url);
    const blob = await res.blob();
    return loadImageRaw(blob, maxDim);
  }

  // If it's a blob URL, fetch and convert
  if (url.startsWith('blob:')) {
    const res = await fetch(url);
    const blob = await res.blob();
    return loadImageRaw(blob, maxDim);
  }

  // For other URLs, try fetching
  const res = await fetch(url);
  const blob = await res.blob();
  return loadImageRaw(blob, maxDim);
}
