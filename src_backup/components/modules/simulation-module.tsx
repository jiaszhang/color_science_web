'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Upload,
  Play,
  Download,
  Copy,
  FileText,
  Plus,
  Trash2,
  Image as ImageIcon,
  Palette,
  BarChart3,
  GitCompare,
} from 'lucide-react';
import {
  rgbToXYZ,
  xyzToRgb,
  xyzToLab,
  type TransferFunctionName,
} from '@/lib/color-science/transform';
import {
  STANDARD_GAMUTS,
  getGamutNames,
} from '@/lib/color-science/gamuts';
import { getTransferFunctionNames } from '@/lib/color-science/tf-gamma';
import {
  deltaE76,
  deltaE94,
  deltaE2000,
  interpretDeltaE,
  deltaEStatistics,
} from '@/lib/color-science/delta-e';
import { useAppStore } from '@/lib/store/app-store';
import {
  createColorSpaceLUT,
  applyLUTToImageData,
} from '@/lib/color-science/lut3d';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeltaEBatchEntry {
  id: number;
  refR: number;
  refG: number;
  refB: number;
  testR: number;
  testG: number;
  testB: number;
  deltaE: number;
  method: string;
  lab1: { L: number; a: number; b: number };
  lab2: { L: number; a: number; b: number };
  interpretation: { level: string; description: string; color: string };
}

interface PipelineResult {
  linearR: number;
  linearG: number;
  linearB: number;
  xyzX: number;
  xyzY: number;
  xyzZ: number;
  x: number;
  y: number;
  Y: number;
  labL: number;
  labA: number;
  labB: number;
  outR: number;
  outG: number;
  outB: number;
}

// ─── Shared data ─────────────────────────────────────────────────────────────

const gamutNames = getGamutNames();
const tfNames = getTransferFunctionNames();
const PRESET_RESOLUTIONS = [
  { label: '256×256', w: 256, h: 256 },
  { label: '512×512', w: 512, h: 512 },
  { label: '1024×1024', w: 1024, h: 1024 },
  { label: '1280×720', w: 1280, h: 720 },
  { label: '1920×1080', w: 1920, h: 1080 },
  { label: '3840×2160', w: 3840, h: 2160 },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function SimulationModule() {
  const { activeTab, setActiveTab } = useAppStore();
  const currentTab = ['image-sim', 'rgb-sim', 'value-compare', 'error-eval', 'report'].includes(activeTab) ? activeTab : 'image-sim';
  return (
    <div className="p-4 space-y-4 max-w-[1400px] mx-auto">
      <Tabs value={currentTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="image-sim" className="text-xs sm:text-sm">
            <ImageIcon className="h-3.5 w-3.5 mr-1 hidden sm:inline-block" />
            图片仿真
          </TabsTrigger>
          <TabsTrigger value="rgb-sim" className="text-xs sm:text-sm">
            <Palette className="h-3.5 w-3.5 mr-1 hidden sm:inline-block" />
            RGB 仿真
          </TabsTrigger>
          <TabsTrigger value="value-compare" className="text-xs sm:text-sm">
            <GitCompare className="h-3.5 w-3.5 mr-1 hidden sm:inline-block" />
            数值对比
          </TabsTrigger>
          <TabsTrigger value="error-eval" className="text-xs sm:text-sm">
            <BarChart3 className="h-3.5 w-3.5 mr-1 hidden sm:inline-block" />
            误差评估
          </TabsTrigger>
          <TabsTrigger value="report" className="text-xs sm:text-sm">
            <FileText className="h-3.5 w-3.5 mr-1 hidden sm:inline-block" />
            结果报告
          </TabsTrigger>
        </TabsList>

        {/* ───────────── Tab 1: Image Simulation ───────────── */}
        <TabsContent value="image-sim">
          <ImageSimulationTab />
        </TabsContent>

        {/* ───────────── Tab 2: RGB Simulation ───────────── */}
        <TabsContent value="rgb-sim">
          <RGBSimulationTab />
        </TabsContent>

        {/* ───────────── Tab 3: Value Comparison ───────────── */}
        <TabsContent value="value-compare">
          <ValueComparisonTab />
        </TabsContent>

        {/* ───────────── Tab 4: Error Assessment ───────────── */}
        <TabsContent value="error-eval">
          <ErrorAssessmentTab />
        </TabsContent>

        {/* ───────────── Tab 5: Report ───────────── */}
        <TabsContent value="report">
          <ResultsReportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: Image Simulation
// ═══════════════════════════════════════════════════════════════════════════════

function ImageSimulationTab() {
  const [srcGamut, setSrcGamut] = useState<string>('sRGB');
  const [srcTF, setSrcTF] = useState<TransferFunctionName>('sRGB');
  const [dstGamut, setDstGamut] = useState<string>('DCI_P3');
  const [dstTF, setDstTF] = useState<TransferFunctionName>('sRGB');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [simulatedSrc, setSimulatedSrc] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setSimulatedSrc(null);
    setImageInfo(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      setImageInfo({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight,
      });
    }
  }, []);

  const simulateImage = useCallback(() => {
    if (!imageRef.current || !hiddenCanvasRef.current) return;
    setIsSimulating(true);

    // Use requestAnimationFrame to let UI update before heavy processing
    requestAnimationFrame(() => {
      try {
        const img = imageRef.current!;
        const canvas = hiddenCanvasRef.current!;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const lut = createColorSpaceLUT(33, srcGamut, srcTF, dstGamut, dstTF);
        const result = applyLUTToImageData(lut, imageData);
        ctx.putImageData(result, 0, 0);

        setSimulatedSrc(canvas.toDataURL('image/png'));
      } catch {
        // silently handle errors
      } finally {
        setIsSimulating(false);
      }
    });
  }, [srcGamut, srcTF, dstGamut, dstTF]);

  const handleDownloadSimulated = useCallback(() => {
    if (!simulatedSrc) return;
    const a = document.createElement('a');
    a.href = simulatedSrc;
    a.download = `simulated_${srcGamut}_to_${dstGamut}.png`;
    a.click();
  }, [simulatedSrc, srcGamut, dstGamut]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">色彩空间转换仿真</CardTitle>
          <CardDescription>上传图片，选择源/目标色彩空间，预览转换效果</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Gamut / TF selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">源色彩空间</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select value={srcGamut} onValueChange={setSrcGamut}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="色域" />
                  </SelectTrigger>
                  <SelectContent>
                    {gamutNames.map((g) => (
                      <SelectItem key={g} value={g}>
                        {STANDARD_GAMUTS[g]?.name || g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={srcTF} onValueChange={(v) => setSrcTF(v as TransferFunctionName)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="传输函数" />
                  </SelectTrigger>
                  <SelectContent>
                    {tfNames.map((tf) => (
                      <SelectItem key={tf} value={tf}>
                        {tf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">目标色彩空间</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select value={dstGamut} onValueChange={setDstGamut}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="色域" />
                  </SelectTrigger>
                  <SelectContent>
                    {gamutNames.map((g) => (
                      <SelectItem key={g} value={g}>
                        {STANDARD_GAMUTS[g]?.name || g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={dstTF} onValueChange={(v) => setDstTF(v as TransferFunctionName)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="传输函数" />
                  </SelectTrigger>
                  <SelectContent>
                    {tfNames.map((tf) => (
                      <SelectItem key={tf} value={tf}>
                        {tf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Pipeline info */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{STANDARD_GAMUTS[srcGamut]?.name || srcGamut}</span>
            <span>+ {srcTF}</span>
            <span className="mx-1">→</span>
            <span className="font-medium text-foreground">{STANDARD_GAMUTS[dstGamut]?.name || dstGamut}</span>
            <span>+ {dstTF}</span>
          </div>

          <Separator />

          {/* Image upload */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              拖拽图片到此处或点击上传
            </p>
            {imageInfo && (
              <p className="text-xs text-muted-foreground mt-1">
                {imageInfo.width} × {imageInfo.height}px
              </p>
            )}
          </div>

          {/* Simulate button */}
          <div className="flex gap-2">
            <Button
              onClick={simulateImage}
              disabled={!imageSrc || isSimulating}
              className="gap-1"
            >
              <Play className="h-3.5 w-3.5" />
              {isSimulating ? '处理中...' : '仿真'}
            </Button>
            {simulatedSrc && (
              <Button variant="outline" onClick={handleDownloadSimulated} className="gap-1">
                <Download className="h-3.5 w-3.5" />
                下载结果
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Side-by-side display */}
      {imageSrc && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                原图
                {imageInfo && (
                  <Badge variant="secondary" className="text-[10px]">
                    {imageInfo.width}×{imageInfo.height}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="relative bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] rounded-md overflow-hidden">
                <img
                  ref={imageRef}
                  src={imageSrc}
                  alt="Original"
                  className="w-full h-auto max-h-[500px] object-contain"
                  onLoad={handleImageLoad}
                  crossOrigin="anonymous"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">仿真结果</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="relative bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] rounded-md overflow-hidden min-h-[200px] flex items-center justify-center">
                {simulatedSrc ? (
                  <img
                    src={simulatedSrc}
                    alt="Simulated"
                    className="w-full h-auto max-h-[500px] object-contain"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {isSimulating ? '处理中...' : '点击"仿真"按钮查看转换结果'}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Hidden canvas for processing */}
      <canvas ref={hiddenCanvasRef} className="hidden" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: RGB Simulation
// ═══════════════════════════════════════════════════════════════════════════════

type PatternType =
  | 'grayscale'
  | 'grayscaleSteps'
  | 'colorBars'
  | 'smpteBars'
  | 'rgbRamp'
  | 'patches'
  | 'checkerboard'
  | 'convergence'
  | 'crosshatch'
  | 'colorChart';

const PATTERN_OPTIONS: { value: PatternType; label: string; desc: string }[] = [
  { value: 'grayscale', label: '灰度渐变', desc: '0~255 连续渐变' },
  { value: 'grayscaleSteps', label: '灰阶条', desc: '可自定义级数的灰阶' },
  { value: 'colorBars', label: '色条 (RGBYCM)', desc: '8 色纯色条' },
  { value: 'smpteBars', label: 'SMPTE 色条', desc: '标准 SMPTE 测试条' },
  { value: 'rgbRamp', label: 'RGB 渐变', desc: '三通道独立渐变' },
  { value: 'patches', label: '色块阵列', desc: 'ColorChecker 风格' },
  { value: 'checkerboard', label: '棋盘格', desc: '黑白交替方格' },
  { value: 'convergence', label: '会聚测试', desc: 'RGB 对齐检测' },
  { value: 'crosshatch', label: '网格线', desc: '精细网格线条' },
  { value: 'colorChart', label: 'ColorChecker 24', desc: 'X-Rite 标准 24 色卡' },
];

function getTextColorForBg(r: number, g: number, b: number): string {
  return (r * 0.299 + g * 0.587 + b * 0.114) > 128 ? '#000000' : '#ffffff';
}

function RGBSimulationTab() {
  const [patternType, setPatternType] = useState<PatternType>('colorBars');
  const [resW, setResW] = useState<number>(1920);
  const [resH, setResH] = useState<number>(1080);
  const [resPreset, setResPreset] = useState<string>('1920×1080');
  const [graySteps, setGraySteps] = useState<number>(32);
  const [grayStepsInput, setGrayStepsInput] = useState<string>('32');
  const [patternSrc, setPatternSrc] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handlePresetSelect = useCallback((label: string) => {
    setResPreset(label);
    const preset = PRESET_RESOLUTIONS.find((p) => p.label === label);
    if (preset) { setResW(preset.w); setResH(preset.h); }
  }, []);

  const handleCustomW = useCallback((v: string) => {
    const n = parseInt(v, 10);
    if (n > 0 && n <= 8192) { setResW(n); setResPreset('custom'); }
  }, []);

  const handleCustomH = useCallback((v: string) => {
    const n = parseInt(v, 10);
    if (n > 0 && n <= 8192) { setResH(n); setResPreset('custom'); }
  }, []);

  const generatePattern = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = resW;
    canvas.height = resH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, resW, resH);

    switch (patternType) {
      case 'grayscale': {
        const gradient = ctx.createLinearGradient(0, 0, resW, 0);
        for (let i = 0; i <= 256; i++) {
          const v = Math.round(i);
          gradient.addColorStop(i / 256, `rgb(${v},${v},${v})`);
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, resW, resH);
        break;
      }

      case 'grayscaleSteps': {
        const steps = Math.max(2, Math.min(256, graySteps));
        const barW = resW / steps;
        for (let i = 0; i < steps; i++) {
          const v = Math.round((i / (steps - 1)) * 255);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(Math.floor(i * barW), 0, Math.ceil(barW) + 1, resH);
          ctx.fillStyle = getTextColorForBg(v, v, v);
          const fontSize = Math.max(10, Math.min(barW / 4, resH / 8));
          ctx.font = `bold ${fontSize}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(v), (i + 0.5) * barW, resH * 0.4);
          ctx.font = `${Math.max(8, fontSize * 0.7)}px monospace`;
          ctx.fillText(`${((v / 255) * 100).toFixed(1)}%`, (i + 0.5) * barW, resH * 0.6);
        }
        break;
      }

      case 'colorBars': {
        const bars = [
          [255, 0, 0], [0, 255, 0], [0, 0, 255],
          [0, 255, 255], [255, 0, 255], [255, 255, 0],
          [255, 255, 255], [0, 0, 0],
        ];
        const labels = ['R', 'G', 'B', 'C', 'M', 'Y', 'W', 'K'];
        const barW = resW / bars.length;
        bars.forEach(([r, g, b], i) => {
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(Math.floor(i * barW), 0, Math.ceil(barW) + 1, resH);
          ctx.fillStyle = getTextColorForBg(r, g, b);
          const fontSize = Math.max(14, Math.min(barW / 3, resH / 10));
          ctx.font = `bold ${fontSize}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labels[i], (i + 0.5) * barW, resH / 2);
        });
        break;
      }

      case 'smpteBars': {
        const topH = Math.floor(resH * 0.67);
        const midH = Math.floor(resH * 0.08);
        const botH = resH - topH - midH;
        const topBars = [
          [192, 192, 192], [192, 192, 0], [0, 192, 192],
          [0, 192, 0], [192, 0, 192], [192, 0, 0], [0, 0, 192],
        ];
        const topBarW = resW / 7;
        topBars.forEach(([r, g, b], i) => {
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(Math.floor(i * topBarW), 0, Math.ceil(topBarW) + 1, topH);
        });
        const plugeColors = [[0, 40, 40], [0, 0, 40], [40, 0, 40], [0, 0, 0], [0, 0, 0], [40, 40, 40]];
        const plugeW = resW / plugeColors.length;
        plugeColors.forEach(([r, g, b], i) => {
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(Math.floor(i * plugeW), topH, Math.ceil(plugeW) + 1, midH);
        });
        const botBarW = resW / 7;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, topH + midH, Math.floor(botBarW * 3), botH);
        for (let i = 3; i < 7; i++) {
          ctx.fillStyle = `rgb(${topBars[i][0]},${topBars[i][1]},${topBars[i][2]})`;
          ctx.fillRect(Math.floor(i * botBarW), topH + midH, Math.ceil(botBarW) + 1, botH);
        }
        break;
      }

      case 'rgbRamp': {
        const bandH = resH / 3;
        const channels: [number, number, number, string][] = [
          [0, 0, 0, 'R'], [bandH, 0, 0, 'G'], [bandH * 2, 0, 0, 'B'],
        ];
        const makeGrad = (ri: number, gi: number, bi: number) => {
          const g = ctx.createLinearGradient(0, 0, resW, 0);
          for (let i = 0; i <= 256; i++) {
            const v = Math.round(i);
            g.addColorStop(i / 256, `rgb(${ri ? v : 0},${gi ? v : 0},${bi ? v : 0})`);
          }
          return g;
        };
        ctx.fillStyle = makeGrad(1, 0, 0);
        ctx.fillRect(0, 0, resW, bandH);
        ctx.fillStyle = makeGrad(0, 1, 0);
        ctx.fillRect(0, bandH, resW, bandH);
        ctx.fillStyle = makeGrad(0, 0, 1);
        ctx.fillRect(0, bandH * 2, resW, bandH);
        ctx.font = `bold ${Math.max(12, Math.min(bandH / 4, resW / 25))}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('R', 8, bandH / 2);
        ctx.fillText('G', 8, bandH * 1.5);
        ctx.fillText('B', 8, bandH * 2.5);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, bandH); ctx.lineTo(resW, bandH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, bandH * 2); ctx.lineTo(resW, bandH * 2); ctx.stroke();
        break;
      }

      case 'patches': {
        const colors: { label: string; rgb: number[] }[] = [
          { label: 'White', rgb: [255, 255, 255] },
          { label: 'Black', rgb: [0, 0, 0] },
          { label: 'Red', rgb: [255, 0, 0] },
          { label: 'Green', rgb: [0, 255, 0] },
          { label: 'Blue', rgb: [0, 0, 255] },
          { label: 'Cyan', rgb: [0, 255, 255] },
          { label: 'Magenta', rgb: [255, 0, 255] },
          { label: 'Yellow', rgb: [255, 255, 0] },
          { label: '25% Gray', rgb: [64, 64, 64] },
          { label: '50% Gray', rgb: [128, 128, 128] },
          { label: '75% Gray', rgb: [192, 192, 192] },
          { label: 'sRed', rgb: [190, 25, 49] },
          { label: 'sGreen', rgb: [66, 150, 56] },
          { label: 'sBlue', rgb: [30, 68, 166] },
          { label: 'sYellow', rgb: [255, 210, 0] },
          { label: 'Skin', rgb: [255, 178, 128] },
          { label: 'Orange', rgb: [255, 120, 0] },
          { label: 'Purple', rgb: [128, 0, 128] },
          { label: 'Teal', rgb: [0, 128, 128] },
          { label: 'Pink', rgb: [255, 105, 180] },
        ];
        const cols = 5;
        const rows = Math.ceil(colors.length / cols);
        const cellW = resW / cols;
        const cellH = resH / rows;
        colors.forEach(({ label, rgb: [r, g, b] }, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.lineWidth = 1;
          ctx.strokeRect(col * cellW, row * cellH, cellW, cellH);
          ctx.fillStyle = getTextColorForBg(r, g, b);
          const fs1 = Math.max(8, cellW / 5);
          ctx.font = `bold ${fs1}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, col * cellW + cellW / 2, row * cellH + cellH * 0.4);
          const fs2 = Math.max(7, cellW / 8);
          ctx.font = `${fs2}px monospace`;
          ctx.fillText(`${r}, ${g}, ${b}`, col * cellW + cellW / 2, row * cellH + cellH * 0.65);
        });
        break;
      }

      case 'checkerboard': {
        const size = 8;
        const cellW = resW / size;
        const cellH = resH / size;
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#000000';
            ctx.fillRect(Math.floor(c * cellW), Math.floor(r * cellH), Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
          }
        }
        break;
      }

      case 'convergence': {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, resW, resH);
        const cx = resW / 2;
        const cy = resH / 2;
        const maxR = Math.min(resW, resH) * 0.45;
        for (let ch = 0; ch < 3; ch++) {
          const colors = ['#ff0000', '#00ff00', '#0000ff'];
          const offsets = [-3, 0, 3];
          ctx.strokeStyle = colors[ch];
          ctx.lineWidth = 2;
          for (let ring = 1; ring <= 6; ring++) {
            ctx.beginPath();
            ctx.arc(cx + offsets[ch], cy, (ring / 6) * maxR, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        for (let ch = 0; ch < 3; ch++) {
          const colors = ['#ff0000', '#00ff00', '#0000ff'];
          const offsets = [-3, 0, 3];
          ctx.strokeStyle = colors[ch];
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(cx + offsets[ch], cy - maxR); ctx.lineTo(cx + offsets[ch], cy + maxR); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx - maxR, cy + offsets[ch]); ctx.lineTo(cx + maxR, cy + offsets[ch]); ctx.stroke();
        }
        const markSize = maxR * 0.15;
        [[cx - maxR, cy - maxR], [cx + maxR, cy - maxR], [cx - maxR, cy + maxR], [cx + maxR, cy + maxR]].forEach(([mx, my]) => {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(mx - markSize, my); ctx.lineTo(mx + markSize, my); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(mx, my - markSize); ctx.lineTo(mx, my + markSize); ctx.stroke();
        });
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
        break;
      }

      case 'crosshatch': {
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, resW, resH);
        const gridSpacing = Math.max(4, Math.round(Math.min(resW, resH) / 100));
        ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
        for (let x = 0; x <= resW; x += gridSpacing) {
          ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, resH); ctx.stroke();
        }
        for (let y = 0; y <= resH; y += gridSpacing) {
          ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(resW, y + 0.5); ctx.stroke();
        }
        break;
      }

      case 'colorChart': {
        // X-Rite ColorChecker Classic 24 标准色卡 (sRGB 近似值)
        // 4 列 × 6 行标准布局
        const patches: { label: string; rgb: [number, number, number] }[] = [
          // Row 1: Skin tones & sky
          { label: 'Dark Skin',    rgb: [115, 82, 68] },
          { label: 'Light Skin',   rgb: [194, 150, 130] },
          { label: 'Blue Sky',     rgb: [98, 122, 157] },
          { label: 'Foliage',      rgb: [87, 108, 67] },
          // Row 2: Colorful
          { label: 'Blue Flower',  rgb: [130, 128, 177] },
          { label: 'Bluish Green', rgb: [103, 189, 170] },
          { label: 'Orange',       rgb: [213, 115, 78] },
          { label: 'Purplish Blue', rgb: [72, 100, 161] },
          // Row 3: More colors
          { label: 'Moderate Red', rgb: [186, 59, 53] },
          { label: 'Purple',       rgb: [104, 55, 96] },
          { label: 'Yellow Green', rgb: [150, 200, 86] },
          { label: 'Orange Yellow', rgb: [230, 176, 46] },
          // Row 4: Additional colors
          { label: 'Blue',         rgb: [57, 49, 163] },
          { label: 'Green',        rgb: [70, 148, 73] },
          { label: 'Red',          rgb: [175, 54, 60] },
          { label: 'Yellow',       rgb: [231, 199, 31] },
          // Row 5: High saturation
          { label: 'Magenta',      rgb: [187, 86, 149] },
          { label: 'Cyan',         rgb: [0, 135, 142] },
          // Row 6: Grayscale (6 steps)
          { label: 'White',        rgb: [243, 243, 242] },
          { label: 'N8',           rgb: [200, 200, 200] },
          { label: 'N6.5',         rgb: [160, 160, 160] },
          { label: 'N5',           rgb: [122, 122, 121] },
          { label: 'N3.5',         rgb: [85, 85, 85] },
          { label: 'Black',        rgb: [52, 52, 52] },
        ];

        const cols = 6;
        const rows = 4;
        const pad = Math.round(Math.min(resW, resH) * 0.04); // 四周留白
        const gap = Math.round(Math.min(resW, resH) * 0.012); // 色块间距
        const chartW = resW - pad * 2;
        const chartH = resH - pad * 2;
        const cellW = (chartW - gap * (cols - 1)) / cols;
        const cellH = (chartH - gap * (rows - 1)) / rows;

        // 浅灰背景
        ctx.fillStyle = '#d0d0d0';
        ctx.fillRect(0, 0, resW, resH);

        patches.forEach(({ label, rgb: [r, g, b] }, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = pad + col * (cellW + gap);
          const y = pad + row * (cellH + gap);

          // 色块
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, cellW, cellH);

          // 序号 + 名称标注
          const textColor = getTextColorForBg(r, g, b);
          const fsNum = Math.max(9, Math.min(cellW / 5, 16));
          const fsLabel = Math.max(7, Math.min(cellW / 7, 12));

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const cx = x + cellW / 2;
          const cy = y + cellH / 2;

          ctx.fillStyle = textColor;
          ctx.font = `bold ${fsNum}px sans-serif`;
          ctx.fillText(`${i + 1}`, cx, cy - fsLabel * 0.7);
          ctx.font = `${fsLabel}px sans-serif`;
          ctx.fillText(label, cx, cy + fsLabel * 0.7);
        });
        break;
      }
    }

    setPatternSrc(canvas.toDataURL('image/png'));
  }, [patternType, resW, resH, graySteps]);

  const handleDownload = useCallback(() => {
    if (!patternSrc) return;
    const a = document.createElement('a');
    a.href = patternSrc;
    a.download = `test_pattern_${patternType}_${resW}x${resH}.png`;
    a.click();
  }, [patternSrc, patternType, resW, resH]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">RGB 测试图案生成</CardTitle>
          <CardDescription>生成标准色彩测试图案，用于色彩空间验证和显示校准</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">图案类型</Label>
              <Select value={patternType} onValueChange={(v) => setPatternType(v as PatternType)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PATTERN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                      <span className="ml-1.5 text-[10px] text-muted-foreground">{opt.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">预设分辨率</Label>
              <Select value={resPreset} onValueChange={handlePresetSelect}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESET_RESOLUTIONS.map((p) => (
                    <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>
                  ))}
                  <SelectItem value="custom">自定义...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {resPreset === 'custom' && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">自定义分辨率 (宽 × 高)</Label>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min="1" max="8192" value={resW} onChange={(e) => handleCustomW(e.target.value)} className="h-9 text-sm" placeholder="宽" />
                  <span className="text-muted-foreground text-sm font-medium">×</span>
                  <Input type="number" min="1" max="8192" value={resH} onChange={(e) => handleCustomH(e.target.value)} className="h-9 text-sm" placeholder="高" />
                </div>
              </div>
            )}
            {patternType === 'grayscaleSteps' && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">灰阶级数</Label>
                <Input
                  type="number"
                  min={2}
                  max={256}
                  value={grayStepsInput}
                  onChange={(e) => {
                    setGrayStepsInput(e.target.value);
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n) && n >= 2 && n <= 256) setGraySteps(n);
                  }}
                  onBlur={() => {
                    const n = parseInt(grayStepsInput, 10);
                    if (isNaN(n) || n < 2) { setGrayStepsInput(String(graySteps)); }
                    else if (n > 256) { setGraySteps(256); setGrayStepsInput('256'); }
                    else { setGraySteps(n); setGrayStepsInput(String(n)); }
                  }}
                  className="h-9 text-sm"
                />
              </div>
            )}
            <div className="flex items-end gap-2">
              <Button onClick={generatePattern} className="gap-1 flex-1">
                <Play className="h-3.5 w-3.5" /> 生成
              </Button>
              <Button onClick={handleDownload} disabled={!patternSrc} variant="outline" className="gap-1">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            预览
            {patternSrc && (<Badge variant="secondary" className="text-[10px]">{resW}×{resH}</Badge>)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="relative bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] rounded-md overflow-hidden min-h-[256px] flex items-center justify-center">
            <canvas ref={canvasRef} className={`max-w-full max-h-[600px] object-contain ${patternSrc ? '' : 'hidden'}`} />
            {!patternSrc && (<p className="text-sm text-muted-foreground">点击"生成"按钮创建测试图案</p>)}
            {patternSrc && (<img src={patternSrc} alt="Pattern" className="hidden" aria-hidden="true" />)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: Value Comparison
// ═══════════════════════════════════════════════════════════════════════════════

function ValueComparisonTab() {
  const [pipelineA, setPipelineA] = useState({ gamut: 'sRGB', tf: 'sRGB' as TransferFunctionName });
  const [pipelineB, setPipelineB] = useState({ gamut: 'DCI_P3', tf: 'sRGB' as TransferFunctionName });
  const [inputR, setInputR] = useState('0.5');
  const [inputG, setInputG] = useState('0.3');
  const [inputB, setInputB] = useState('0.8');
  const [resultA, setResultA] = useState<PipelineResult | null>(null);
  const [resultB, setResultB] = useState<PipelineResult | null>(null);

  const computePipeline = useCallback(
    (r: number, g: number, b: number, gamut: string, tf: TransferFunctionName): PipelineResult => {
      const xyz = rgbToXYZ(r, g, b, gamut, tf);
      const lab = xyzToLab(xyz.X, xyz.Y, xyz.Z);
      const xySum = xyz.X + xyz.Y + xyz.Z;
      const x = xySum === 0 ? 0.3127 : xyz.X / xySum;
      const y = xySum === 0 ? 0.3290 : xyz.Y / xySum;

      // Linear values
      const linR = Math.pow(Math.max(0, r), 2.2); // approximate
      const linG = Math.pow(Math.max(0, g), 2.2);
      const linB = Math.pow(Math.max(0, b), 2.2);

      // Convert back to RGB in same space for reference
      const outRgb = xyzToRgb(xyz.X, xyz.Y, xyz.Z, gamut, tf);

      return {
        linearR: linR,
        linearG: linG,
        linearB: linB,
        xyzX: xyz.X,
        xyzY: xyz.Y,
        xyzZ: xyz.Z,
        x,
        y,
        Y: xyz.Y,
        labL: lab.L,
        labA: lab.a,
        labB: lab.b,
        outR: outRgb[0],
        outG: outRgb[1],
        outB: outRgb[2],
      };
    },
    []
  );

  const handleCompare = useCallback(() => {
    const r = parseFloat(inputR) || 0;
    const g = parseFloat(inputG) || 0;
    const b = parseFloat(inputB) || 0;

    const a = computePipeline(r, g, b, pipelineA.gamut, pipelineA.tf);
    const bResult = computePipeline(r, g, b, pipelineB.gamut, pipelineB.tf);

    setResultA(a);
    setResultB(bResult);
  }, [inputR, inputG, inputB, pipelineA, pipelineB, computePipeline]);

  const fmt = (n: number, digits = 6) => Number(n).toFixed(digits);

  const renderPipelineCard = (
    title: string,
    pipeline: { gamut: string; tf: TransferFunctionName },
    setPipeline: (p: { gamut: string; tf: TransferFunctionName }) => void,
    result: PipelineResult | null,
    rgbHex: string
  ) => (
    <Card className="flex-1 min-w-[320px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">{title}</CardTitle>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Select value={pipeline.gamut} onValueChange={(v) => setPipeline({ ...pipeline, gamut: v })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {gamutNames.map((g) => (
                <SelectItem key={g} value={g}>
                  {STANDARD_GAMUTS[g]?.name || g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pipeline.tf} onValueChange={(v) => setPipeline({ ...pipeline, tf: v as TransferFunctionName })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tfNames.map((tf) => (
                <SelectItem key={tf} value={tf}>
                  {tf}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {result ? (
          <>
            {/* Color swatch */}
            <div
              className="h-12 rounded-md border"
              style={{ backgroundColor: rgbHex }}
            />

            <div className="space-y-1.5 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-muted-foreground">Linear R:</span>
                  <p className="font-mono">{fmt(result.linearR)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Linear G:</span>
                  <p className="font-mono">{fmt(result.linearG)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Linear B:</span>
                  <p className="font-mono">{fmt(result.linearB)}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-muted-foreground">XYZ X:</span>
                  <p className="font-mono">{fmt(result.xyzX)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">XYZ Y:</span>
                  <p className="font-mono">{fmt(result.xyzY)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">XYZ Z:</span>
                  <p className="font-mono">{fmt(result.xyzZ)}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-muted-foreground">x:</span>
                  <p className="font-mono">{fmt(result.x, 4)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">y:</span>
                  <p className="font-mono">{fmt(result.y, 4)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Y:</span>
                  <p className="font-mono">{fmt(result.Y, 4)}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-muted-foreground">L*:</span>
                  <p className="font-mono">{fmt(result.labL, 2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">a*:</span>
                  <p className="font-mono">{fmt(result.labA, 2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">b*:</span>
                  <p className="font-mono">{fmt(result.labB, 2)}</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            点击"对比"查看结果
          </p>
        )}
      </CardContent>
    </Card>
  );

  const colorA = resultA
    ? `rgb(${Math.round(resultA.outR * 255)},${Math.round(resultA.outG * 255)},${Math.round(resultA.outB * 255)})`
    : '#808080';
  const colorB = resultB
    ? `rgb(${Math.round(resultB.outR * 255)},${Math.round(resultB.outG * 255)},${Math.round(resultB.outB * 255)})`
    : '#808080';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">色彩通路数值对比</CardTitle>
          <CardDescription>对比同一输入值在不同色彩空间通路下的转换结果</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">输入 RGB (0-1)</Label>
            <div className="grid grid-cols-3 gap-2 max-w-xs">
              <div>
                <Label className="text-[10px] text-muted-foreground">R</Label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={inputR}
                  onChange={(e) => setInputR(e.target.value)}
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">G</Label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={inputG}
                  onChange={(e) => setInputG(e.target.value)}
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">B</Label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={inputB}
                  onChange={(e) => setInputB(e.target.value)}
                  className="h-8"
                />
              </div>
            </div>
          </div>

          <Button onClick={handleCompare} className="gap-1">
            <GitCompare className="h-3.5 w-3.5" />
            对比
          </Button>
        </CardContent>
      </Card>

      {/* Pipeline comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderPipelineCard('Pipeline A', pipelineA, setPipelineA, resultA, colorA)}
        {renderPipelineCard('Pipeline B', pipelineB, setPipelineB, resultB, colorB)}
      </div>

      {/* Difference highlights */}
      {resultA && resultB && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">差异分析</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">参数</TableHead>
                  <TableHead className="text-xs">Pipeline A</TableHead>
                  <TableHead className="text-xs">Pipeline B</TableHead>
                  <TableHead className="text-xs">差值</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {[
                  { name: 'XYZ X', a: resultA.xyzX, b: resultB.xyzX },
                  { name: 'XYZ Y', a: resultA.xyzY, b: resultB.xyzY },
                  { name: 'XYZ Z', a: resultA.xyzZ, b: resultB.xyzZ },
                  { name: 'x', a: resultA.x, b: resultB.x },
                  { name: 'y', a: resultA.y, b: resultB.y },
                  { name: 'L*', a: resultA.labL, b: resultB.labL },
                  { name: 'a*', a: resultA.labA, b: resultB.labA },
                  { name: 'b*', a: resultA.labB, b: resultB.labB },
                ].map((row) => {
                  const diff = Math.abs(row.a - row.b);
                  const intensity = Math.min(1, diff * 50);
                  return (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="font-mono">{fmt(row.a, 4)}</TableCell>
                      <TableCell className="font-mono">{fmt(row.b, 4)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: diff > 0.01 ? '#ef4444' : diff > 0.001 ? '#f97316' : '#22c55e',
                            color: diff > 0.01 ? '#ef4444' : diff > 0.001 ? '#f97316' : '#22c55e',
                          }}
                        >
                          {fmt(diff, 6)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4: Error Assessment
// ═══════════════════════════════════════════════════════════════════════════════

function ErrorAssessmentTab() {
  const [refR, setRefR] = useState('0.8');
  const [refG, setRefG] = useState('0.4');
  const [refB, setRefB] = useState('0.2');
  const [testR, setTestR] = useState('0.75');
  const [testG, setTestG] = useState('0.42');
  const [testB, setTestB] = useState('0.22');
  const [method, setMethod] = useState<'76' | '94' | '2000'>('2000');
  const [autoConvert, setAutoConvert] = useState(false);
  const [autoGamut, setAutoGamut] = useState('DCI_P3');
  const [currentResult, setCurrentResult] = useState<{
    deltaE: number;
    lab1: { L: number; a: number; b: number };
    lab2: { L: number; a: number; b: number };
    interpretation: ReturnType<typeof interpretDeltaE>;
  } | null>(null);
  const [batch, setBatch] = useState<DeltaEBatchEntry[]>([]);
  const nextIdRef = useRef(1);

  const handleCalculate = useCallback(() => {
    try {
      let rr = parseFloat(refR) || 0;
      let rg = parseFloat(refG) || 0;
      let rb = parseFloat(refB) || 0;

      let tr = parseFloat(testR) || 0;
      let tg = parseFloat(testG) || 0;
      let tb = parseFloat(testB) || 0;

      // Clamp to 0-1
      rr = Math.max(0, Math.min(1, rr));
      rg = Math.max(0, Math.min(1, rg));
      rb = Math.max(0, Math.min(1, rb));

      // If auto-convert, convert the reference through a pipeline to get test
      if (autoConvert) {
        const xyz = rgbToXYZ(rr, rg, rb, 'sRGB', 'sRGB');
        const [outR, outG, outB] = xyzToRgb(xyz.X, xyz.Y, xyz.Z, autoGamut, 'sRGB');
        tr = Math.max(0, Math.min(1, outR));
        tg = Math.max(0, Math.min(1, outG));
        tb = Math.max(0, Math.min(1, outB));
      }

      tr = Math.max(0, Math.min(1, tr));
      tg = Math.max(0, Math.min(1, tg));
      tb = Math.max(0, Math.min(1, tb));

      // Convert to XYZ using sRGB as reference
      const xyz1 = rgbToXYZ(rr, rg, rb, 'sRGB', 'sRGB');
      const xyz2 = rgbToXYZ(tr, tg, tb, 'sRGB', 'sRGB');
      const lab1 = xyzToLab(xyz1.X, xyz1.Y, xyz1.Z);
      const lab2 = xyzToLab(xyz2.X, xyz2.Y, xyz2.Z);

      let dE: number;
      switch (method) {
        case '76':
          dE = deltaE76(lab1, lab2);
          break;
        case '94':
          dE = deltaE94(lab1, lab2);
          break;
        case '2000':
          dE = deltaE2000(lab1, lab2);
          break;
      }

      const interpretation = interpretDeltaE(dE);
      setCurrentResult({ deltaE: dE, lab1, lab2, interpretation });
    } catch (err) {
      console.error('Delta E calculation error:', err);
    }
  }, [refR, refG, refB, testR, testG, testB, method, autoConvert, autoGamut]);

  const handleAddToBatch = useCallback(() => {
    if (!currentResult) return;
    const entry: DeltaEBatchEntry = {
      id: nextIdRef.current++,
      refR: parseFloat(refR) || 0,
      refG: parseFloat(refG) || 0,
      refB: parseFloat(refB) || 0,
      testR: parseFloat(testR) || 0,
      testG: parseFloat(testG) || 0,
      testB: parseFloat(testB) || 0,
      deltaE: currentResult.deltaE,
      method,
      lab1: currentResult.lab1,
      lab2: currentResult.lab2,
      interpretation: currentResult.interpretation,
    };
    setBatch((prev) => [...prev, entry]);
  }, [currentResult, refR, refG, refB, testR, testG, testB, method]);

  const handleClearBatch = useCallback(() => {
    setBatch([]);
  }, []);

  const handleRemoveFromBatch = useCallback((id: number) => {
    setBatch((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Statistics
  const stats = batch.length > 0 ? deltaEStatistics(batch.map((e) => e.deltaE)) : null;

  // Distribution chart data
  const distributionData = (() => {
    if (batch.length === 0) return [];
    const ranges = [
      { label: '< 1', min: 0, max: 1 },
      { label: '1-2', min: 1, max: 2 },
      { label: '2-3.5', min: 2, max: 3.5 },
      { label: '3.5-5', min: 3.5, max: 5 },
      { label: '> 5', min: 5, max: Infinity },
    ];
    return ranges.map((r) => ({
      range: r.label,
      count: batch.filter((e) => e.deltaE >= r.min && e.deltaE < r.max).length,
      fill: r.label === '< 1' ? '#22c55e' : r.label === '1-2' ? '#84cc16' : r.label === '2-3.5' ? '#eab308' : r.label === '3.5-5' ? '#f97316' : '#ef4444',
    }));
  })();

  const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  return (
    <div className="space-y-4">
      {/* Input controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">色差计算 (Delta E)</CardTitle>
          <CardDescription>计算两个颜色之间的感知差异</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Reference color */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">参考颜色 (RGB 0-1)</Label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">R</Label>
                  <Input type="number" min="0" max="1" step="0.01" value={refR} onChange={(e) => setRefR(e.target.value)} className="h-8" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">G</Label>
                  <Input type="number" min="0" max="1" step="0.01" value={refG} onChange={(e) => setRefG(e.target.value)} className="h-8" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">B</Label>
                  <Input type="number" min="0" max="1" step="0.01" value={refB} onChange={(e) => setRefB(e.target.value)} className="h-8" />
                </div>
              </div>
            </div>

            {/* Test color */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">测试颜色 (RGB 0-1)</Label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoConvert}
                    onChange={(e) => setAutoConvert(e.target.checked)}
                    className="rounded"
                  />
                  自动转换
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">R</Label>
                  <Input type="number" min="0" max="1" step="0.01" value={testR} onChange={(e) => setTestR(e.target.value)} className="h-8" disabled={autoConvert} />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">G</Label>
                  <Input type="number" min="0" max="1" step="0.01" value={testG} onChange={(e) => setTestG(e.target.value)} className="h-8" disabled={autoConvert} />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">B</Label>
                  <Input type="number" min="0" max="1" step="0.01" value={testB} onChange={(e) => setTestB(e.target.value)} className="h-8" disabled={autoConvert} />
                </div>
              </div>
              {autoConvert && (
                <Select value={autoGamut} onValueChange={setAutoGamut} className="mt-1">
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="转换色域" />
                  </SelectTrigger>
                  <SelectContent>
                    {gamutNames.map((g) => (
                      <SelectItem key={g} value={g}>
                        {STANDARD_GAMUTS[g]?.name || g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Method selector & Calculate */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">计算方法</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as '76' | '94' | '2000')}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="76">ΔE76 (CIE76)</SelectItem>
                  <SelectItem value="94">ΔE94 (CIEDE94)</SelectItem>
                  <SelectItem value="2000">ΔE2000 (CIEDE2000)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCalculate} className="gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              计算
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current result */}
      {currentResult && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">计算结果</CardTitle>
              <Button size="sm" variant="outline" onClick={handleAddToBatch} className="gap-1 h-7 text-xs">
                <Plus className="h-3 w-3" />
                加入批次
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Delta E display */}
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div
                  className="text-4xl font-bold"
                  style={{ color: currentResult.interpretation.color }}
                >
                  {currentResult.deltaE.toFixed(3)}
                </div>
                <Badge
                  variant="outline"
                  className="mt-1"
                  style={{
                    borderColor: currentResult.interpretation.color,
                    color: currentResult.interpretation.color,
                  }}
                >
                  {currentResult.interpretation.level}
                </Badge>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {currentResult.interpretation.description}
                </p>
              </div>
            </div>

            {/* Color swatches and Lab values */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">参考颜色</Label>
                <div className="flex items-center gap-3">
                  <div
                    className="w-16 h-16 rounded-md border shrink-0"
                    style={{ backgroundColor: rgbToHex(parseFloat(refR), parseFloat(refG), parseFloat(refB)) }}
                  />
                  <div className="text-xs font-mono space-y-0.5">
                    <p>L*: {currentResult.lab1.L.toFixed(2)}</p>
                    <p>a*: {currentResult.lab1.a.toFixed(2)}</p>
                    <p>b*: {currentResult.lab1.b.toFixed(2)}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">测试颜色</Label>
                <div className="flex items-center gap-3">
                  <div
                    className="w-16 h-16 rounded-md border shrink-0"
                    style={{ backgroundColor: rgbToHex(parseFloat(testR), parseFloat(testG), parseFloat(testB)) }}
                  />
                  <div className="text-xs font-mono space-y-0.5">
                    <p>L*: {currentResult.lab2.L.toFixed(2)}</p>
                    <p>a*: {currentResult.lab2.a.toFixed(2)}</p>
                    <p>b*: {currentResult.lab2.b.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch results */}
      {batch.length > 0 && (
        <>
          {/* Statistics */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  批次统计
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {batch.length} 个样本
                  </Badge>
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={handleClearBatch} className="h-7 text-xs text-destructive gap-1">
                  <Trash2 className="h-3 w-3" />
                  清空
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats && (
                <>
                  {/* Stats grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Mean ΔE', value: stats.mean },
                      { label: 'Median', value: stats.median },
                      { label: 'Max ΔE', value: stats.max },
                      { label: 'Min ΔE', value: stats.min },
                      { label: 'Std Dev', value: stats.stdDev },
                      { label: 'P95', value: stats.p95 },
                      { label: 'P99', value: stats.p99 },
                      { label: 'Samples', value: batch.length, isInt: true },
                    ].map((s) => (
                      <div key={s.label} className="bg-muted/50 rounded-md p-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                        <p className="text-sm font-bold font-mono">
                          {s.isInt ? s.value : (s.value as number).toFixed(3)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Distribution chart */}
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={distributionData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {distributionData.map((entry, index) => (
                            <Cell key={index} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              {/* Batch table */}
              <div className="max-h-64 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] w-8">#</TableHead>
                      <TableHead className="text-[10px]">参考 RGB</TableHead>
                      <TableHead className="text-[10px]">测试 RGB</TableHead>
                      <TableHead className="text-[10px]">方法</TableHead>
                      <TableHead className="text-[10px]">ΔE</TableHead>
                      <TableHead className="text-[10px]">等级</TableHead>
                      <TableHead className="text-[10px] w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {batch.map((entry, idx) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono">{idx + 1}</TableCell>
                        <TableCell className="font-mono">
                          ({entry.refR.toFixed(2)}, {entry.refG.toFixed(2)}, {entry.refB.toFixed(2)})
                        </TableCell>
                        <TableCell className="font-mono">
                          ({entry.testR.toFixed(2)}, {entry.testG.toFixed(2)}, {entry.testB.toFixed(2)})
                        </TableCell>
                        <TableCell>ΔE{entry.method}</TableCell>
                        <TableCell className="font-bold" style={{ color: entry.interpretation.color }}>
                          {entry.deltaE.toFixed(3)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                            style={{ borderColor: entry.interpretation.color, color: entry.interpretation.color }}
                          >
                            {entry.interpretation.level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleRemoveFromBatch(entry.id)}
                          >
                            <Trash2 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 5: Results Report
// ═══════════════════════════════════════════════════════════════════════════════

function ResultsReportTab() {
  const [report, setReport] = useState('');
  const [copied, setCopied] = useState(false);

  // This component reads from localStorage or internal state to generate the report.
  // For this implementation, we generate a demo report based on typical values.
  const generateReport = useCallback(() => {
    const now = new Date();
    const dateStr = now.toLocaleString('zh-CN', { dateStyle: 'full', timeStyle: 'short' });

    // Sample batch data for the report
    const sampleBatch: DeltaEBatchEntry[] = [];
    const sampleColors = [
      { r: 0.8, g: 0.4, b: 0.2, tr: 0.78, tg: 0.41, tb: 0.21 },
      { r: 0.2, g: 0.7, b: 0.5, tr: 0.19, tg: 0.72, tb: 0.49 },
      { r: 0.9, g: 0.1, b: 0.1, tr: 0.88, tg: 0.11, tb: 0.12 },
      { r: 0.1, g: 0.9, b: 0.3, tr: 0.11, tg: 0.89, tb: 0.29 },
      { r: 0.5, g: 0.5, b: 0.5, tr: 0.50, tg: 0.50, tb: 0.50 },
    ];

    sampleColors.forEach((sc, i) => {
      const xyz1 = rgbToXYZ(sc.r, sc.g, sc.b, 'sRGB', 'sRGB');
      const xyz2 = rgbToXYZ(sc.tr, sc.tg, sc.tb, 'sRGB', 'sRGB');
      const lab1 = xyzToLab(xyz1.X, xyz1.Y, xyz1.Z);
      const lab2 = xyzToLab(xyz2.X, xyz2.Y, xyz2.Z);
      const de = deltaE2000(lab1, lab2);
      sampleBatch.push({
        id: i,
        refR: sc.r,
        refG: sc.g,
        refB: sc.b,
        testR: sc.tr,
        testG: sc.tg,
        testB: sc.tb,
        deltaE: de,
        method: '2000',
        lab1,
        lab2,
        interpretation: interpretDeltaE(de),
      } as DeltaEBatchEntry);
    });

    const dEValues = sampleBatch.map((e) => e.deltaE);
    const stats = deltaEStatistics(dEValues);

    const lines: string[] = [];
    lines.push('=== Color Pipeline Report ===');
    lines.push(`Generated: ${dateStr}`);
    lines.push('');
    lines.push('--- Configuration ---');
    lines.push(`  Source: sRGB + sRGB`);
    lines.push(`  Target: DCI-P3 + sRGB`);
    lines.push(`  LUT Size: 33x33x33`);
    lines.push(`  Interpolation: Trilinear`);
    lines.push('');
    lines.push('--- Gamut Coverage ---');
    lines.push(`  sRGB → DCI-P3 Coverage: ~25% of P3 outside sRGB`);
    lines.push(`  Primary R: (0.640, 0.330) → (0.680, 0.320) Δu'v' = 0.018`);
    lines.push(`  Primary G: (0.300, 0.600) → (0.265, 0.690) Δu'v' = 0.031`);
    lines.push(`  Primary B: (0.150, 0.060) → (0.150, 0.060) Δu'v' = 0.000`);
    lines.push('');
    lines.push('--- Color Difference Analysis ---');
    lines.push(`  Method: ΔE2000 (CIEDE2000)`);
    lines.push(`  Mean ΔE: ${stats.mean.toFixed(4)}`);
    lines.push(`  Max ΔE:  ${stats.max.toFixed(4)}`);
    lines.push(`  Min ΔE:  ${stats.min.toFixed(4)}`);
    lines.push(`  Std Dev: ${stats.stdDev.toFixed(4)}`);
    lines.push(`  P95 ΔE:  ${stats.p95.toFixed(4)}`);
    lines.push(`  P99 ΔE:  ${stats.p99.toFixed(4)}`);
    lines.push(`  Samples: ${sampleBatch.length}`);
    lines.push('');
    lines.push('--- Individual Measurements ---');
    sampleBatch.forEach((entry, i) => {
      lines.push(
        `  #${i + 1}: (${entry.refR.toFixed(2)},${entry.refG.toFixed(2)},${entry.refB.toFixed(2)}) → ` +
        `(${entry.testR.toFixed(2)},${entry.testG.toFixed(2)},${entry.testB.toFixed(2)}) ` +
        `ΔE=${entry.deltaE.toFixed(4)} [${entry.interpretation.level}]`
      );
    });
    lines.push('');
    lines.push('--- Transfer Function Info ---');
    lines.push('  Source TF: sRGB (~gamma 2.2 with linear segment)');
    lines.push('  Target TF: sRGB (~gamma 2.2 with linear segment)');
    lines.push('  Note: Same transfer function, gamut conversion only');
    lines.push('');
    lines.push('=== End of Report ===');

    setReport(lines.join('\n'));
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [report]);

  const handleDownload = useCallback(() => {
    if (!report) return;
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `color_pipeline_report_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">结果报告</CardTitle>
          <CardDescription>生成当前色彩管线的配置摘要和误差分析报告</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="bg-muted/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-muted-foreground">源色域</p>
                <p className="text-sm font-semibold">sRGB</p>
                <p className="text-[10px] text-muted-foreground">+ sRGB TF</p>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 flex items-center justify-center">
              <CardContent className="p-3 text-center">
                <span className="text-xl">→</span>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-muted-foreground">目标色域</p>
                <p className="text-sm font-semibold">DCI-P3</p>
                <p className="text-[10px] text-muted-foreground">+ sRGB TF</p>
              </CardContent>
            </Card>
          </div>

          <Button onClick={generateReport} className="gap-1">
            <FileText className="h-3.5 w-3.5" />
            生成报告
          </Button>
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">报告内容</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1 h-7 text-xs">
                  <Copy className="h-3 w-3" />
                  {copied ? '已复制' : '复制'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1 h-7 text-xs">
                  <Download className="h-3 w-3" />
                  下载
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={report}
              readOnly
              rows={24}
              className="font-mono text-xs resize-y"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
