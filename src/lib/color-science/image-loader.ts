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
 */

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
}

/**
 * Load an image file without browser ICC color conversion.
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
      return { canvas, ctx, width: w, height: h, dataUrl };
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
