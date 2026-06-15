'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Upload,
  Download,
  Loader2,
  Sun,
  Image as ImageIcon,
} from 'lucide-react';
import {
  processHDRImage,
  generateToneCurveData,
  generateHDRPreview,
  type TMOParams,
  type TMOExposureResult,
} from '@/lib/color-science/reference-white-tmo';

// ============ Types ============

interface HDRImageData {
  pixels: Uint16Array | Float32Array | Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  bitDepth: number;
  isBgr: boolean;
}

// ============ Tone Curve Canvas ============

function ToneCurveCanvas({
  params,
}: {
  params: TMOParams;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = generateToneCurveData(params, 500);

    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    ctx.scale(dpr, dpr);

    const padL = 45;
    const padR = 15;
    const padT = 20;
    const padB = 35;
    const plotW = displayW - padL - padR;
    const plotH = displayH - padT - padB;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, displayW, displayH);

    // Grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gy = padT + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(padL + plotW, gy);
      ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const gx = padL + (plotW * i) / 4;
      ctx.beginPath();
      ctx.moveTo(gx, padT);
      ctx.lineTo(gx, padT + plotH);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    const xMax = Math.max(...x, 1);
    const yMax = Math.max(...y, 1);
    const xRange = xMax;
    const yRange = yMax;

    // Plot curve
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < x.length; i++) {
      const px = padL + (x[i] / xRange) * plotW;
      const py = padT + plotH - (y[i] / yRange) * plotH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const val = (xRange * i) / 4;
      const gx = padL + (plotW * i) / 4;
      ctx.fillText(val.toFixed(1), gx, padT + plotH + 15);
    }
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = (yRange * (4 - i)) / 4;
      const gy = padT + (plotH * i) / 4;
      ctx.fillText(val.toFixed(2), padL - 5, gy + 3);
    }

    // Axis titles
    ctx.fillStyle = '#374151';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('x (max(R,G,B) / Lw)', padL + plotW / 2, displayH - 3);
    ctx.save();
    ctx.translate(10, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('TC(x)', 0, 0);
    ctx.restore();

    // Title
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Reference White TMO Tone Curve', padL, padT - 6);

  }, [params]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ minHeight: '200px' }}
    />
  );
}

// ============ Slider Component ============

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  description,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  description?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <span className="text-xs font-mono text-muted-foreground">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      />
      {description && (
        <p className="text-[10px] text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

// ============ Image Drop Zone ============

function ImageDropZone({
  imageSrc,
  imageName,
  onFileLoad,
  label,
}: {
  imageSrc: string | null;
  imageName: string;
  onFileLoad: (src: string, name: string, img: HTMLImageElement) => void;
  label: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        onFileLoad(canvas.toDataURL('image/png'), file.name, img);
      };
      img.src = URL.createObjectURL(file);
    },
    [onFileLoad]
  );

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div
        className={`relative border-2 border-dashed rounded-lg transition-colors cursor-pointer
          ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'}
          ${imageSrc ? 'p-2' : 'p-6'}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/tiff,image/tif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        {imageSrc ? (
          <div className="space-y-1.5">
            <img src={imageSrc} alt={imageName} className="w-full h-32 object-contain rounded" />
            <p className="text-xs text-muted-foreground truncate">{imageName}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="w-5 h-5" />
            <p className="text-xs">拖拽或点击上传 HDR 图像</p>
            <p className="text-[10px]">支持 16bit PQ PNG/TIFF</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Main TMO Module ============

export default function TmoModule() {
  // TMO parameters with defaults
  const [params, setParams] = useState<TMOParams>({
    sourceImagePeak: 1000,
    sourceImageReferenceWhite: 203,
    mappingTargetReferenceWhite: 203,
    mappingTargetPeak: 1000,
    sdrExposureAnchor: 1000 / 203,
    minimumSdrExposure: 0.5,
    offsetAnchor: 8 / 3,
  });

  const [downsampleFactor, setDownsampleFactor] = useState(2);

  // Image state
  const [hdrImageSrc, setHdrImageSrc] = useState<string | null>(null);
  const [hdrImageName, setHdrImageName] = useState('');
  const [hdrData, setHdrData] = useState<HDRImageData | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [tmoPreview, setTmoPreview] = useState<string | null>(null);
  const [exposureResult, setExposureResult] = useState<TMOExposureResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tmoOutputDataUrl, setTmoOutputDataUrl] = useState<string | null>(null);

  // Update param helper
  const updateParam = useCallback(<K extends keyof TMOParams>(key: K, value: TMOParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Handle HDR image load
  const handleHDRImageLoad = useCallback((src: string, name: string, img: HTMLImageElement) => {
    setHdrImageSrc(src);
    setHdrImageName(name);
    setTmoPreview(null);
    setExposureResult(null);
    setTmoOutputDataUrl(null);

    // Read pixel data from image
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Determine bit depth — for PNG, canvas gives 8-bit per channel
    // But we treat the pixel values as PQ-encoded signal in [0, 1]
    // So we normalize 8-bit values to [0, 1]
    setHdrData({
      pixels: imageData.data,
      width: canvas.width,
      height: canvas.height,
      bitDepth: 8,
      isBgr: false, // Canvas gives RGBA order
    });
  }, []);

  // Apply TMO to image
  const handleApplyTMO = useCallback(() => {
    if (!hdrData) return;
    setIsProcessing(true);

    requestAnimationFrame(() => {
      try {
        const { outputRgba, processedWidth, processedHeight, exposureResult: result } = processHDRImage(
          hdrData.pixels,
          hdrData.width,
          hdrData.height,
          params,
          hdrData.isBgr,
          downsampleFactor
        );

        setExposureResult(result);

        // Create preview canvas
        const canvas = document.createElement('canvas');
        canvas.width = processedWidth;
        canvas.height = processedHeight;
        const ctx = canvas.getContext('2d')!;
        const imageData = new ImageData(outputRgba, processedWidth, processedHeight);
        ctx.putImageData(imageData, 0, 0);

        const dataUrl = canvas.toDataURL('image/png');
        setTmoPreview(dataUrl);
        setTmoOutputDataUrl(dataUrl);
      } catch (err) {
        console.error('TMO processing error:', err);
      } finally {
        setIsProcessing(false);
      }
    });
  }, [hdrData, params, downsampleFactor]);

  // Download TMO output
  const handleDownload = useCallback(() => {
    if (!tmoOutputDataUrl) return;
    const a = document.createElement('a');
    a.href = tmoOutputDataUrl;
    a.download = `tmo_output_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [tmoOutputDataUrl]);

  return (
    <div className="p-4 space-y-4 max-w-[1400px] mx-auto">
      {/* Top: Two-column layout — params + curve */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Parameters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sun className="w-4 h-4" />
              Reference White TMO 参数
            </CardTitle>
            <CardDescription>
              基于参考白的 HDR→SDR 色调映射，支持 ST.2084 (PQ) 输入
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Source metadata */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-2 block">源图像元数据</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ParamSlider
                  label="源峰值 Lc (cd/m²)"
                  value={params.sourceImagePeak}
                  min={100}
                  max={4000}
                  step={10}
                  onChange={(v) => updateParam('sourceImagePeak', v)}
                  description="MaxCLL / metadata_Lc"
                />
                <ParamSlider
                  label="源参考白 Lw (cd/m²)"
                  value={params.sourceImageReferenceWhite}
                  min={50}
                  max={500}
                  step={1}
                  onChange={(v) => updateParam('sourceImageReferenceWhite', v)}
                  description="MaxFALL / metadata_Lw"
                />
              </div>
            </div>

            <Separator />

            {/* Target metadata */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-2 block">映射目标</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ParamSlider
                  label="目标参考白 (cd/m²)"
                  value={params.mappingTargetReferenceWhite}
                  min={50}
                  max={500}
                  step={1}
                  onChange={(v) => updateParam('mappingTargetReferenceWhite', v)}
                />
                <ParamSlider
                  label="目标峰值 (cd/m²)"
                  value={params.mappingTargetPeak}
                  min={200}
                  max={4000}
                  step={10}
                  onChange={(v) => updateParam('mappingTargetPeak', v)}
                />
              </div>
            </div>

            <Separator />

            {/* TMO tuning */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-2 block">TMO 调优参数</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ParamSlider
                  label="SDR 曝光锚点"
                  value={params.sdrExposureAnchor}
                  min={2}
                  max={10}
                  step={0.1}
                  onChange={(v) => updateParam('sdrExposureAnchor', v)}
                  description="默认 Lc/Lw"
                />
                <ParamSlider
                  label="最小 SDR 曝光"
                  value={params.minimumSdrExposure}
                  min={0.1}
                  max={1}
                  step={0.05}
                  onChange={(v) => updateParam('minimumSdrExposure', v)}
                />
                <ParamSlider
                  label="偏移锚点"
                  value={params.offsetAnchor}
                  min={1.5}
                  max={5}
                  step={0.1}
                  onChange={(v) => updateParam('offsetAnchor', v)}
                  description="默认 8/3 ≈ 2.67"
                />
                <ParamSlider
                  label="下采样因子"
                  value={downsampleFactor}
                  min={1}
                  max={8}
                  step={1}
                  onChange={setDownsampleFactor}
                  description="1=原始分辨率，更大=更快"
                />
              </div>
            </div>

            {/* Exposure info */}
            {exposureResult && (
              <>
                <Separator />
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-muted rounded-md p-2 text-center">
                    <div className="text-muted-foreground">output_exposure</div>
                    <div className="font-mono font-semibold">{exposureResult.outputExposure.toFixed(3)}</div>
                  </div>
                  <div className="bg-muted rounded-md p-2 text-center">
                    <div className="text-muted-foreground">headroom_src</div>
                    <div className="font-mono font-semibold">{exposureResult.sourceImageHeadroom.toFixed(3)}</div>
                  </div>
                  <div className="bg-muted rounded-md p-2 text-center">
                    <div className="text-muted-foreground">headroom_tgt</div>
                    <div className="font-mono font-semibold">{exposureResult.mappingTargetHeadroom.toFixed(3)}</div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Right: Tone Curve */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">色调映射曲线</CardTitle>
            <CardDescription>
              实时预览 TC(x) 曲线，拖动左侧参数滑块时自动更新
            </CardDescription>
          </CardHeader>
          <CardContent className="p-2">
            <div className="h-[340px]">
              <ToneCurveCanvas params={params} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom: Image upload + preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            图像处理
          </CardTitle>
          <CardDescription>
            上传 PQ HDR 图像，应用 Reference White TMO，预览并导出 SDR 结果
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload area */}
          <div className="max-w-md">
            <ImageDropZone
              label="上传 PQ HDR 图像 (16bit PNG/TIFF)"
              imageSrc={hdrImageSrc}
              imageName={hdrImageName}
              onFileLoad={handleHDRImageLoad}
            />
          </div>

          {/* Image info */}
          {hdrData && (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary">{hdrData.width}×{hdrData.height}</Badge>
              <Badge variant="outline">{hdrData.bitDepth}-bit</Badge>
              <span className="text-muted-foreground">{hdrImageName}</span>
            </div>
          )}

          {/* Apply + Download buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleApplyTMO}
              disabled={!hdrData || isProcessing}
              className="gap-2"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
              {isProcessing ? '处理中...' : '应用 TMO'}
            </Button>
            {tmoOutputDataUrl && (
              <Button variant="outline" onClick={handleDownload} className="gap-2">
                <Download className="w-4 h-4" />
                下载 SDR 输出
              </Button>
            )}
          </div>

          <Separator />

          {/* Side by side preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">原始 HDR (归一化预览)</Label>
              <div className="relative bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] rounded-lg overflow-hidden min-h-[200px] flex items-center justify-center border">
                {hdrImageSrc ? (
                  <img src={hdrImageSrc} alt="Original HDR" className="w-full h-auto max-h-[500px] object-contain" />
                ) : (
                  <p className="text-sm text-muted-foreground">等待上传...</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">TMO 输出 (SDR)</Label>
              <div className="relative bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] rounded-lg overflow-hidden min-h-[200px] flex items-center justify-center border">
                {tmoPreview ? (
                  <img src={tmoPreview} alt="TMO Output" className="w-full h-auto max-h-[500px] object-contain" />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {isProcessing ? '处理中...' : '点击"应用 TMO"查看结果'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
