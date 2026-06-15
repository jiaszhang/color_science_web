/**
 * Image Format Utilities — Export Format Selection & Conversion
 *
 * Provides:
 *  - Format type definitions and labels
 *  - Client-side export for PNG/JPEG/WebP (via canvas.toBlob)
 *  - Server-side export for TIFF/BMP/16-bit TIFF (via /api/image-convert)
 *  - A reusable format config for UI dropdowns
 */

// ─── Format Definitions ─────────────────────────────────────────────────────

export type ExportImageFormat =
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'tiff'
  | 'tiff16'
  | 'bmp';

export interface ExportFormatOption {
  value: ExportImageFormat;
  label: string;
  description: string;
  /** Whether this format uses server-side conversion */
  serverSide: boolean;
}

export const EXPORT_FORMAT_OPTIONS: ExportFormatOption[] = [
  { value: 'png', label: 'PNG', description: '无损压缩，支持 Alpha', serverSide: false },
  { value: 'jpeg', label: 'JPEG', description: '有损压缩，文件较小', serverSide: false },
  { value: 'webp', label: 'WebP', description: '现代格式，兼顾质量与大小', serverSide: false },
  { value: 'tiff', label: 'TIFF 8-bit', description: '无损，LZW 压缩', serverSide: true },
  { value: 'tiff16', label: 'TIFF 16-bit', description: '高精度 16 位/通道', serverSide: true },
  { value: 'bmp', label: 'BMP', description: '无压缩位图', serverSide: true },
];

/** Get the MIME type for a format */
export function getMimeType(format: ExportImageFormat): string {
  switch (format) {
    case 'png': return 'image/png';
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'tiff':
    case 'tiff16': return 'image/tiff';
    case 'bmp': return 'image/bmp';
  }
}

/** Get the file extension for a format */
export function getFileExtension(format: ExportImageFormat): string {
  switch (format) {
    case 'png': return 'png';
    case 'jpeg': return 'jpg';
    case 'webp': return 'webp';
    case 'tiff':
    case 'tiff16': return 'tiff';
    case 'bmp': return 'bmp';
  }
}

/** Canvas-compatible MIME types (client-side export) */
const CLIENT_SIDE_FORMATS: ExportImageFormat[] = ['png', 'jpeg', 'webp'];

// ─── Export Functions ────────────────────────────────────────────────────────

/**
 * Export a canvas to a file in the specified format.
 *
 * For PNG/JPEG/WebP, this is done client-side via canvas.toBlob().
 * For TIFF/BMP, this sends the canvas data to the server-side API for conversion.
 *
 * @param canvas - The source canvas
 * @param filename - Base filename (without extension)
 * @param format - Target export format
 * @param quality - Quality for lossy formats (0-1)
 */
export async function exportCanvasAsFormat(
  canvas: HTMLCanvasElement,
  filename: string,
  format: ExportImageFormat = 'png',
  quality: number = 0.95
): Promise<void> {
  if (CLIENT_SIDE_FORMATS.includes(format)) {
    // Client-side export
    const mimeType = getMimeType(format);
    const ext = getFileExtension(format);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mimeType, quality);
    });

    if (!blob) {
      throw new Error('Failed to export canvas');
    }

    downloadBlob(blob, `${filename}.${ext}`);
  } else {
    // Server-side export
    const dataUrl = canvas.toDataURL('image/png');

    // Extract base64 data from data URL
    const base64Data = dataUrl.split(',')[1];
    if (!base64Data) {
      throw new Error('Failed to extract canvas data');
    }

    // Convert base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const formData = new FormData();
    const pngBlob = new Blob([bytes], { type: 'image/png' });
    formData.append('file', pngBlob, 'input.png');
    formData.append('action', 'export');
    formData.append('format', format);
    formData.append('quality', String(Math.round(quality * 100)));

    const response = await fetch('/api/image-convert', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Server error' }));
      throw new Error(err.error || `Export failed: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Export failed');
    }

    const { dataUrl: exportDataUrl, extension } = result.data;
    downloadDataUrl(exportDataUrl, `${filename}.${extension}`);
  }
}

/**
 * Export a data URL (typically PNG from canvas) to a file in the specified format.
 *
 * @param dataUrl - Source data URL (typically PNG)
 * @param filename - Base filename (without extension)
 * @param format - Target export format
 * @param quality - Quality for lossy formats (0-1)
 */
export async function exportDataUrlAsFormat(
  dataUrl: string,
  filename: string,
  format: ExportImageFormat = 'png',
  quality: number = 0.95
): Promise<void> {
  if (CLIENT_SIDE_FORMATS.includes(format) && dataUrl.startsWith(`data:${getMimeType(format)}`)) {
    // Already in the correct format, just download
    const ext = getFileExtension(format);
    downloadDataUrl(dataUrl, `${filename}.${ext}`);
    return;
  }

  // Create a temporary canvas from the data URL
  const img = await loadImageElement(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  return exportCanvasAsFormat(canvas, filename, format, quality);
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Generate an export filename with format extension.
 *
 * @param baseName - The base name (e.g., "simulated_sRGB_to_DCI_P3")
 * @param format - The export format
 * @returns Filename with extension (e.g., "simulated_sRGB_to_DCI_P3.tiff")
 */
export function makeExportFilename(baseName: string, format: ExportImageFormat): string {
  return `${baseName}.${getFileExtension(format)}`;
}
