import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'extract-pairs': {
        // Client-side processing is preferred for performance
        // This endpoint is reserved for future server-side processing
        return NextResponse.json({ message: 'Use client-side extraction' });
      }

      case 'generate-calibration': {
        const { gridSize } = body;
        if (!gridSize || gridSize < 2 || gridSize > 65) {
          return NextResponse.json(
            { error: '网格大小必须在 2-65 之间' },
            { status: 400 }
          );
        }
        // Return metadata; actual rendering is done client-side
        const totalColors = gridSize * gridSize * gridSize;
        const patchSize = gridSize <= 17 ? 8 : gridSize <= 33 ? 4 : 2;
        const cols = Math.ceil(Math.sqrt(totalColors));
        const rows = Math.ceil(totalColors / cols);
        const imageWidth = cols * (patchSize + 1) + 1;
        const imageHeight = rows * (patchSize + 1) + 1;

        return NextResponse.json({
          gridSize,
          totalColors,
          patchSize,
          cols,
          rows,
          imageWidth,
          imageHeight,
        });
      }

      case 'extract-calibration': {
        // Client-side processing is preferred for performance
        return NextResponse.json({ message: 'Use client-side extraction' });
      }

      default:
        return NextResponse.json(
          { error: '未知操作' },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      { error: '处理请求失败' },
      { status: 500 }
    );
  }
}
