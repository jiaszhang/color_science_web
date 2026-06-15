import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

/**
 * POST /api/image-convert
 *
 * Handles server-side image format conversion using sharp.
 * Supports:
 *   - Import: TIFF → PNG (for browser display)
 *   - Export: PNG → TIFF, PNG → EXR (16-bit half-float), PNG → BMP, etc.
 *
 * Request body (FormData):
 *   - file: Blob/File — the image to convert
 *   - action: "import" | "export"
 *   - format: target format for export ("tiff" | "png" | "jpeg" | "webp" | "bmp")
 *   - quality: optional quality for lossy formats (1-100)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const action = formData.get('action') as string || 'import';
    const format = formData.get('format') as string || 'png';
    const qualityStr = formData.get('quality') as string | null;
    const quality = qualityStr ? Math.max(1, Math.min(100, parseInt(qualityStr, 10))) : undefined;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());

    if (action === 'import') {
      // Convert TIFF/other formats to PNG for browser consumption
      let pipeline = sharp(inputBuffer, {
        // Limit input size to prevent OOM
        limitInputPixels: 500_000_000,
      });

      // Get metadata
      const metadata = await pipeline.metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      if (width === 0 || height === 0) {
        return NextResponse.json(
          { success: false, error: 'Could not determine image dimensions' },
          { status: 400 }
        );
      }

      // For HDR content (16-bit+), normalize to 8-bit for display
      if ((metadata.channels || 3) >= 3) {
        // Handle high bit-depth by normalizing
        if (metadata.bitdepth && metadata.bitdepth > 8) {
          // Read as raw float, normalize, and output as 8-bit PNG
          const raw = await pipeline
            .raw()
            .toBuffer();

          const maxVal = (1 << (metadata.bitdepth || 16)) - 1;
          const channels = metadata.channels || 3;
          const pixelCount = width * height * channels;
          const normalized = Buffer.alloc(pixelCount);

          for (let i = 0; i < pixelCount; i++) {
            // Read as 16-bit value (for 16-bit depth) or handle accordingly
            if (metadata.bitdepth === 16) {
              const val = raw.readUInt16LE(i * 2);
              normalized[i] = Math.round((val / maxVal) * 255);
            } else {
              // Fallback for other bit depths
              normalized[i] = Math.min(255, Math.round((raw[i] / 255) * 255));
            }
          }

          pipeline = sharp(normalized, {
            raw: { width, height, channels: channels as 1 | 2 | 3 | 4 }
          });
        }
      }

      // Convert to PNG
      const pngBuffer = await pipeline
        .png()
        .toBuffer();

      // Return as base64 data URL
      const base64 = pngBuffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      return NextResponse.json({
        success: true,
        data: {
          dataUrl,
          width,
          height,
          originalFormat: metadata.format,
          bitDepth: metadata.bitdepth,
          channels: metadata.channels,
        },
      });
    }

    if (action === 'export') {
      // Convert from PNG data to target format
      let outputBuffer: Buffer;
      let mimeType: string;
      let extension: string;

      switch (format) {
        case 'tiff':
        case 'tif': {
          outputBuffer = await sharp(inputBuffer)
            .tiff({
              compression: 'lzw',
              bitdepth: 8,
            })
            .toBuffer();
          mimeType = 'image/tiff';
          extension = 'tiff';
          break;
        }
        case 'tiff16':
        case 'tif16': {
          outputBuffer = await sharp(inputBuffer)
            .tiff({
              compression: 'lzw',
              bitdepth: 16,
            })
            .toBuffer();
          mimeType = 'image/tiff';
          extension = 'tiff';
          break;
        }
        case 'jpeg':
        case 'jpg': {
          outputBuffer = await sharp(inputBuffer)
            .jpeg({ quality: quality || 95 })
            .toBuffer();
          mimeType = 'image/jpeg';
          extension = 'jpg';
          break;
        }
        case 'webp': {
          outputBuffer = await sharp(inputBuffer)
            .webp({ quality: quality || 95 })
            .toBuffer();
          mimeType = 'image/webp';
          extension = 'webp';
          break;
        }
        case 'bmp': {
          // Sharp doesn't support BMP output directly, use raw conversion
          const { data, info } = await sharp(inputBuffer)
            .raw()
            .toBuffer({ resolveWithObject: true });

          // Build BMP file manually (24-bit, no alpha)
          const bmpWidth = info.width;
          const bmpHeight = info.height;
          const channels = info.channels;
          const rowSize = Math.ceil((bmpWidth * 3) / 4) * 4; // rows padded to 4 bytes
          const pixelDataSize = rowSize * bmpHeight;
          const headerSize = 54;
          const fileSize = headerSize + pixelDataSize;

          const bmpBuffer = Buffer.alloc(fileSize);
          // BMP header
          bmpBuffer.write('BM', 0);
          bmpBuffer.writeUInt32LE(fileSize, 2);
          bmpBuffer.writeUInt32LE(0, 6);
          bmpBuffer.writeUInt32LE(headerSize, 10);
          // DIB header (BITMAPINFOHEADER)
          bmpBuffer.writeUInt32LE(40, 14);
          bmpBuffer.writeInt32LE(bmpWidth, 18);
          bmpBuffer.writeInt32LE(bmpHeight, 22); // bottom-up
          bmpBuffer.writeUInt16LE(1, 26); // planes
          bmpBuffer.writeUInt16LE(24, 28); // bits per pixel
          bmpBuffer.writeUInt32LE(0, 30); // no compression
          bmpBuffer.writeUInt32LE(pixelDataSize, 34);
          bmpBuffer.writeUInt32LE(2835, 38); // pixels per meter X
          bmpBuffer.writeUInt32LE(2835, 42); // pixels per meter Y
          bmpBuffer.writeUInt32LE(0, 46);
          bmpBuffer.writeUInt32LE(0, 50);

          // Write pixel data (BGR, bottom-up)
          let offset = headerSize;
          for (let y = bmpHeight - 1; y >= 0; y--) {
            for (let x = 0; x < bmpWidth; x++) {
              const srcIdx = (y * bmpWidth + x) * channels;
              bmpBuffer[offset++] = data[srcIdx + 2]; // B
              bmpBuffer[offset++] = data[srcIdx + 1]; // G
              bmpBuffer[offset++] = data[srcIdx];     // R
            }
            // Pad to 4-byte boundary
            const padding = rowSize - bmpWidth * 3;
            for (let p = 0; p < padding; p++) {
              bmpBuffer[offset++] = 0;
            }
          }

          outputBuffer = bmpBuffer;
          mimeType = 'image/bmp';
          extension = 'bmp';
          break;
        }
        case 'png':
        default: {
          outputBuffer = await sharp(inputBuffer)
            .png()
            .toBuffer();
          mimeType = 'image/png';
          extension = 'png';
          break;
        }
      }

      // Return as base64 data URL
      const base64 = outputBuffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;

      return NextResponse.json({
        success: true,
        data: {
          dataUrl,
          mimeType,
          extension,
          size: outputBuffer.length,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error('Image conversion error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Conversion failed' },
      { status: 500 }
    );
  }
}
