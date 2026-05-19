'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ArrowRight, Link, Unlock, Palette, Copy, Check } from 'lucide-react';

import { useAppStore } from '@/lib/store/app-store';
import {
  STANDARD_GAMUTS,
  getGamutNames,
} from '@/lib/color-science/gamuts';
import {
  rgbToXYZMatrix,
  xyzToRGBMatrix,
  type Mat3,
  type Vec3,
  mat3Multiply,
} from '@/lib/color-science/matrices';
import {
  TRANSFER_FUNCTIONS,
  getTransferFunctionNames,
  encodeTF,
  decodeTF,
  generateCurveData,
  generateMultipleCurves,
  type TransferFunctionName,
} from '@/lib/color-science/tf-gamma';
import {
  convertColorSpace,
  rgbToXYZ,
  xyToRgb,
  type VideoRange,
  fullToLimited,
  limitedToFull,
  convertRange,
  convertColorSpaceWithRange,
  generateRangeCurveData,
} from '@/lib/color-science/transform';

// ============ Helper: number clamp ============
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ============ Helper: RGB to hex ============
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => {
    const clamped = clamp(Math.round(v * 255), 0, 255);
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ============ Helper: Color Swatch ============
function ColorSwatch({
  r,
  g,
  b,
  size = 'md',
  label,
}: {
  r: number;
  g: number;
  b: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const sizeClasses = { sm: 'h-8 w-8', md: 'h-12 w-12', lg: 'h-16 w-16' };
  const displayR = clamp(Math.round(r * 255), 0, 255);
  const displayG = clamp(Math.round(g * 255), 0, 255);
  const displayB = clamp(Math.round(b * 255), 0, 255);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`${sizeClasses[size]} rounded-lg border border-border shadow-sm`}
        style={{ backgroundColor: `rgb(${displayR}, ${displayG}, ${displayB})` }}
      />
      {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
    </div>
  );
}

// ============ Helper: Matrix Display ============
function MatrixDisplay({
  matrix,
  title,
  precision = 6,
}: {
  matrix: Mat3;
  title: string;
  precision?: number;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="grid grid-cols-3 gap-x-6 gap-y-1.5 font-mono text-xs">
          {matrix.map((row, i) =>
            row.map((val, j) => (
              <div
                key={`${i}-${j}`}
                className="text-right tabular-nums text-foreground"
              >
                {val >= 0 ? ' ' : ''}
                {val.toFixed(precision)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============ Preset Types ============
interface PresetConfig {
  name: string;
  description: string;
  gamut: string;
  tf: TransferFunctionName;
  gamma?: number;
  badge?: string;
}

const PRESETS: PresetConfig[] = [
  {
    name: 'sRGB',
    description: 'Standard RGB for web and general displays',
    gamut: 'sRGB',
    tf: 'sRGB',
    badge: 'Standard',
  },
  {
    name: 'Rec.709 HD',
    description: 'ITU-R BT.709 HDTV standard',
    gamut: 'Rec709',
    tf: 'bt709',
    badge: 'HD',
  },
  {
    name: 'DCI-P3',
    description: 'Digital Cinema P3, wide-gamut displays',
    gamut: 'DCI_P3',
    tf: 'sRGB',
    badge: 'Wide',
  },
  {
    name: 'Rec.2020 HDR',
    description: 'Ultra-wide gamut with PQ transfer (10-bit HDR)',
    gamut: 'Rec2020',
    tf: 'st2084',
    badge: 'HDR',
  },
  {
    name: 'HLG HDR',
    description: 'Ultra-wide gamut with HLG transfer (broadcast HDR)',
    gamut: 'Rec2020',
    tf: 'hlg',
    badge: 'HDR',
  },
  {
    name: 'Adobe RGB',
    description: 'Adobe RGB (1998), professional photography',
    gamut: 'AdobeRGB',
    tf: 'gamma22',
    badge: 'Photo',
  },
  {
    name: 'DCI',
    description: 'DCI with D65 white, gamma 2.6',
    gamut: 'DCI',
    tf: 'gamma26',
    badge: 'Cinema',
  },
];

// ============ Reusable chart colors ============
const CHART_COLORS = [
  '#8884d8',
  '#82ca9d',
  '#ffc658',
  '#ff7300',
  '#0088fe',
  '#00c49f',
  '#ffbb28',
  '#ff8042',
];

// ============ Main Component ============
export default function ColorFundamentalsModule() {
  // ---- Shared state for tab switching from presets ----
  const { activeTab: storeActiveTab } = useAppStore();
  const validTabs = ['gamut-convert', 'xy-to-rgb', 'transfer-func', 'gamma', 'video-range', 'matrix-ops', 'param-presets', 'param-lock'];
  const [activeTab, setActiveTab] = useState<string>(() => {
    return validTabs.includes(storeActiveTab) ? storeActiveTab : 'gamut-convert';
  });
  React.useEffect(() => {
    if (validTabs.includes(storeActiveTab)) {
      setActiveTab(storeActiveTab);
    }
  }, [storeActiveTab]);

  // ---- Tab 1: Gamut Conversion ----
  const [srcGamut, setSrcGamut] = useState<string>('sRGB');
  const [srcTF, setSrcTF] = useState<TransferFunctionName>('sRGB');
  const [dstGamut, setDstGamut] = useState<string>('DCI_P3');
  const [dstTF, setDstTF] = useState<TransferFunctionName>('sRGB');
  const [inputR, setInputR] = useState<number>(0.5);
  const [inputG, setInputG] = useState<number>(0.3);
  const [inputB, setInputB] = useState<number>(0.2);
  const [conversionResult, setConversionResult] = useState<{
    outputRGB: Vec3;
    xyz: { X: number; Y: number; Z: number };
    xyY: { x: number; y: number; Y: number };
  } | null>(null);

  const handleConvert = useCallback(() => {
    try {
      const xyz = rgbToXYZ(inputR, inputG, inputB, srcGamut, srcTF);
      const outputRGB = convertColorSpace(
        inputR, inputG, inputB,
        srcGamut, srcTF,
        dstGamut, dstTF
      );
      const sum = xyz.X + xyz.Y + xyz.Z;
      const xyY =
        sum === 0
          ? { x: 0.3127, y: 0.329, Y: 0 }
          : { x: xyz.X / sum, y: xyz.Y / sum, Y: xyz.Y };
      setConversionResult({ outputRGB, xyz, xyY });
    } catch {
      setConversionResult(null);
    }
  }, [inputR, inputG, inputB, srcGamut, srcTF, dstGamut, dstTF]);

  const applyPreset = useCallback(
    (preset: PresetConfig) => {
      setSrcGamut(preset.gamut);
      setSrcTF(preset.tf);
      setActiveTab('gamut-convert');
    },
    []
  );

  // ---- Tab 2: Transfer Function ----
  const [selectedTF, setSelectedTF] = useState<TransferFunctionName>('sRGB');
  const [customGamma, setCustomGamma] = useState<number>(2.2);
  const [overlayTFs, setOverlayTFs] = useState<TransferFunctionName[]>(['sRGB', 'bt709']);
  const [tfInputValue, setTfInputValue] = useState<number>(0.5);

  const tfCurveData = useMemo(() => {
    return generateCurveData(selectedTF, customGamma, 128);
  }, [selectedTF, customGamma]);

  const tfEncodedOutput = useMemo(() => {
    return encodeTF(tfInputValue, selectedTF, customGamma);
  }, [tfInputValue, selectedTF, customGamma]);

  const tfDecodedOutput = useMemo(() => {
    return decodeTF(tfInputValue, selectedTF, customGamma);
  }, [tfInputValue, selectedTF, customGamma]);

  const multiCurveData = useMemo(() => {
    if (overlayTFs.length < 2) return null;
    const curves = overlayTFs.map((tf) => ({
      name: TRANSFER_FUNCTIONS[tf].name,
      tf,
    }));
    return generateMultipleCurves(curves, 128);
  }, [overlayTFs]);

  const toggleOverlayTF = useCallback((tf: TransferFunctionName) => {
    setOverlayTFs((prev) => {
      if (prev.includes(tf)) {
        return prev.filter((t) => t !== tf);
      }
      return [...prev, tf];
    });
  }, []);

  // ---- Tab 3: Gamma ----
  const [gammaValue, setGammaValue] = useState<number>(2.2);
  const [gammaInput, setGammaInput] = useState<number>(0.5);
  const [gammaResult, setGammaResult] = useState<number | null>(null);
  const [gammaMode, setGammaMode] = useState<'encode' | 'decode'>('encode');

  const gammaCurveData = useMemo(() => {
    return generateCurveData('custom', gammaValue, 128);
  }, [gammaValue]);

  const handleGammaOp = useCallback(() => {
    if (gammaMode === 'encode') {
      setGammaResult(Math.pow(Math.max(0, gammaInput), 1 / gammaValue));
    } else {
      setGammaResult(Math.pow(Math.max(0, gammaInput), gammaValue));
    }
  }, [gammaInput, gammaValue, gammaMode]);

  // ---- Tab 4: Matrix Operations ----
  const [matrixGamut, setMatrixGamut] = useState<string>('sRGB');
  const [matrixGamutB, setMatrixGamutB] = useState<string>('DCI_P3');
  const [showCombined, setShowCombined] = useState(false);

  const matricesData = useMemo(() => {
    const gamut = STANDARD_GAMUTS[matrixGamut];
    if (!gamut) return null;
    const m = rgbToXYZMatrix(gamut.red, gamut.green, gamut.blue, gamut.white);
    const mInv = xyzToRGBMatrix(m);
    return { rgbToXYZ: m, xyzToRGB: mInv };
  }, [matrixGamut]);

  const combinedMatrix = useMemo(() => {
    if (!showCombined) return null;
    const gamutA = STANDARD_GAMUTS[matrixGamut];
    const gamutB = STANDARD_GAMUTS[matrixGamutB];
    if (!gamutA || !gamutB) return null;
    const mAToXYZ = rgbToXYZMatrix(gamutA.red, gamutA.green, gamutA.blue, gamutA.white);
    const mBToRGB = xyzToRGBMatrix(
      rgbToXYZMatrix(gamutB.red, gamutB.green, gamutB.blue, gamutB.white)
    );
    return mat3Multiply(mBToRGB, mAToXYZ);
  }, [matrixGamut, matrixGamutB, showCombined]);

  // ---- Tab 6: Parameter Lock ----
  const [paramR, setParamR] = useState<number>(0.5);
  const [paramG, setParamG] = useState<number>(0.5);
  const [paramB, setParamB] = useState<number>(0.5);
  const [linkedMode, setLinkedMode] = useState<boolean>(false);
  const [copiedHex, setCopiedHex] = useState(false);

  const handleLinkedChange = useCallback(
    (channel: 'R' | 'G' | 'B', value: number) => {
      if (linkedMode) {
        setParamR(value);
        setParamG(value);
        setParamB(value);
      } else {
        if (channel === 'R') setParamR(value);
        else if (channel === 'G') setParamG(value);
        else setParamB(value);
      }
    },
    [linkedMode]
  );

  const paramHex = useMemo(() => rgbToHex(paramR, paramG, paramB), [paramR, paramG, paramB]);

  const handleCopyHex = useCallback(() => {
    navigator.clipboard.writeText(paramHex);
    setCopiedHex(true);
    setTimeout(() => setCopiedHex(false), 1500);
  }, [paramHex]);

  // ---- Tab: xy→RGB ----
  const [xyInputX, setXyInputX] = useState<number>(0.3127);
  const [xyInputY, setXyInputY] = useState<number>(0.3290);
  const [xyInputY2, setXyInputY2] = useState<number>(0.5);
  const [xyTargetGamut, setXyTargetGamut] = useState<string>('sRGB');
  const [xyTargetTF, setXyTargetTF] = useState<TransferFunctionName>('sRGB');
  const [xyResult, setXyResult] = useState<{
    rgb: Vec3;
    xyz: { X: number; Y: number; Z: number };
    outOfGamut: boolean;
  } | null>(null);

  const handleXyToRgb = useCallback(() => {
    try {
      const rgb = xyToRgb(xyInputX, xyInputY, xyInputY2, xyTargetGamut, xyTargetTF);
      const xyz = { X: (xyInputX * xyInputY2) / xyInputY, Y: xyInputY2, Z: ((1 - xyInputX - xyInputY) * xyInputY2) / xyInputY };
      if (rgb === null) {
        setXyResult({ rgb: [0, 0, 0], xyz, outOfGamut: true });
      } else {
        setXyResult({ rgb, xyz, outOfGamut: false });
      }
    } catch {
      setXyResult(null);
    }
  }, [xyInputX, xyInputY, xyInputY2, xyTargetGamut, xyTargetTF]);

  // ---- Tab: Video Range ----
  const [rangeSrcGamut, setRangeSrcGamut] = useState<string>('Rec709');
  const [rangeSrcTF, setRangeSrcTF] = useState<TransferFunctionName>('bt709');
  const [rangeDstGamut, setRangeDstGamut] = useState<string>('sRGB');
  const [rangeDstTF, setRangeDstTF] = useState<TransferFunctionName>('sRGB');
  const [rangeInputR, setRangeInputR] = useState<number>(0.5);
  const [rangeInputG, setRangeInputG] = useState<number>(0.5);
  const [rangeInputB, setRangeInputB] = useState<number>(0.5);
  const [srcRange, setSrcRange] = useState<VideoRange>('limited');
  const [dstRange, setDstRange] = useState<VideoRange>('full');
  const [rangeResult, setRangeResult] = useState<{
    outputRGB: Vec3;
    intermediateRGB: Vec3;
  } | null>(null);

  const handleRangeConvert = useCallback(() => {
    try {
      const result = convertColorSpaceWithRange(
        rangeInputR, rangeInputG, rangeInputB,
        rangeSrcGamut, rangeSrcTF, srcRange,
        rangeDstGamut, rangeDstTF, dstRange
      );
      const fullRgb = srcRange === 'limited'
        ? [limitedToFull(rangeInputR), limitedToFull(rangeInputG), limitedToFull(rangeInputB)]
        : [rangeInputR, rangeInputG, rangeInputB];
      const intermediate = convertColorSpace(fullRgb[0], fullRgb[1], fullRgb[2], rangeSrcGamut, rangeSrcTF, rangeDstGamut, rangeDstTF);
      setRangeResult({ outputRGB: result, intermediateRGB: intermediate });
    } catch {
      setRangeResult(null);
    }
  }, [rangeInputR, rangeInputG, rangeInputB, rangeSrcGamut, rangeSrcTF, rangeDstGamut, rangeDstTF, srcRange, dstRange]);

  const rangeCurveData = useMemo(() => generateRangeCurveData(), []);

  // ============ Render ============
  return (
    <div className="p-4 space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="gamut-convert" className="text-xs px-2.5">
            色域转换
          </TabsTrigger>
          <TabsTrigger value="xy-to-rgb" className="text-xs px-2.5">
            xy→RGB
          </TabsTrigger>
          <TabsTrigger value="transfer-func" className="text-xs px-2.5">
            传输函数
          </TabsTrigger>
          <TabsTrigger value="gamma" className="text-xs px-2.5">
            Gamma
          </TabsTrigger>
          <TabsTrigger value="video-range" className="text-xs px-2.5">
            范围转换
          </TabsTrigger>
          <TabsTrigger value="matrix-ops" className="text-xs px-2.5">
            矩阵运算
          </TabsTrigger>
          <TabsTrigger value="param-presets" className="text-xs px-2.5">
            参数预设
          </TabsTrigger>
          <TabsTrigger value="param-lock" className="text-xs px-2.5">
            参数联动/锁定
          </TabsTrigger>
        </TabsList>

        {/* ==================== TAB 1: 色域转换 ==================== */}
        <TabsContent value="gamut-convert">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Input Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">色域转换 / Gamut Conversion</CardTitle>
                <CardDescription>在不同色彩空间之间转换 RGB 颜色</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Source */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">源 (Source)</Label>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] text-muted-foreground">色域</span>
                      <Select value={srcGamut} onValueChange={setSrcGamut}>
                        <SelectTrigger className="w-full h-8 text-xs" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getGamutNames().map((g) => (
                            <SelectItem key={g} value={g} className="text-xs">
                              {STANDARD_GAMUTS[g].name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] text-muted-foreground">传输函数</span>
                      <Select value={srcTF} onValueChange={(v) => setSrcTF(v as TransferFunctionName)}>
                        <SelectTrigger className="w-full h-8 text-xs" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getTransferFunctionNames().map((tf) => (
                            <SelectItem key={tf} value={tf} className="text-xs">
                              {TRANSFER_FUNCTIONS[tf].name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex justify-center">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Target */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">目标 (Target)</Label>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] text-muted-foreground">色域</span>
                      <Select value={dstGamut} onValueChange={setDstGamut}>
                        <SelectTrigger className="w-full h-8 text-xs" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getGamutNames().map((g) => (
                            <SelectItem key={g} value={g} className="text-xs">
                              {STANDARD_GAMUTS[g].name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] text-muted-foreground">传输函数</span>
                      <Select value={dstTF} onValueChange={(v) => setDstTF(v as TransferFunctionName)}>
                        <SelectTrigger className="w-full h-8 text-xs" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getTransferFunctionNames().map((tf) => (
                            <SelectItem key={tf} value={tf} className="text-xs">
                              {TRANSFER_FUNCTIONS[tf].name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* RGB Input */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">输入 RGB (0 ~ 1)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-red-500">R</span>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={inputR}
                        onChange={(e) => setInputR(clamp(parseFloat(e.target.value) || 0, 0, 1))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-green-500">G</span>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={inputG}
                        onChange={(e) => setInputG(clamp(parseFloat(e.target.value) || 0, 0, 1))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-blue-500">B</span>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={inputB}
                        onChange={(e) => setInputB(clamp(parseFloat(e.target.value) || 0, 0, 1))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <Button onClick={handleConvert} className="w-full" size="sm">
                  转换 / Convert
                </Button>
              </CardContent>
            </Card>

            {/* Output Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">转换结果 / Result</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {conversionResult ? (
                  <>
                    {/* Color Swatches */}
                    <div className="flex items-center justify-center gap-6">
                      <ColorSwatch r={inputR} g={inputG} b={inputB} size="lg" label="输入" />
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                      <ColorSwatch
                        r={conversionResult.outputRGB[0]}
                        g={conversionResult.outputRGB[1]}
                        b={conversionResult.outputRGB[2]}
                        size="lg"
                        label="输出"
                      />
                    </div>

                    <Separator />

                    {/* Output RGB */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">输出 RGB</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-md border bg-muted/30 px-3 py-1.5 text-center">
                          <span className="text-[10px] text-red-500 font-medium">R</span>
                          <p className="text-xs font-mono tabular-nums">
                            {conversionResult.outputRGB[0].toFixed(6)}
                          </p>
                        </div>
                        <div className="rounded-md border bg-muted/30 px-3 py-1.5 text-center">
                          <span className="text-[10px] text-green-500 font-medium">G</span>
                          <p className="text-xs font-mono tabular-nums">
                            {conversionResult.outputRGB[1].toFixed(6)}
                          </p>
                        </div>
                        <div className="rounded-md border bg-muted/30 px-3 py-1.5 text-center">
                          <span className="text-[10px] text-blue-500 font-medium">B</span>
                          <p className="text-xs font-mono tabular-nums">
                            {conversionResult.outputRGB[2].toFixed(6)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* XYZ */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">中间 XYZ (线性)</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['X', 'Y', 'Z'] as const).map((ch, i) => {
                          const val =
                            ch === 'X'
                              ? conversionResult.xyz.X
                              : ch === 'Y'
                                ? conversionResult.xyz.Y
                                : conversionResult.xyz.Z;
                          return (
                            <div
                              key={ch}
                              className="rounded-md border bg-muted/30 px-3 py-1.5 text-center"
                            >
                              <span className="text-[10px] text-muted-foreground font-medium">
                                {ch}
                              </span>
                              <p className="text-xs font-mono tabular-nums">{val.toFixed(6)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* xyY */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">xyY 色度坐标</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['x', 'y', 'Y'] as const).map((ch) => {
                          const val =
                            ch === 'x'
                              ? conversionResult.xyY.x
                              : ch === 'y'
                                ? conversionResult.xyY.y
                                : conversionResult.xyY.Y;
                          return (
                            <div
                              key={ch}
                              className="rounded-md border bg-muted/30 px-3 py-1.5 text-center"
                            >
                              <span className="text-[10px] text-muted-foreground font-medium">
                                {ch}
                              </span>
                              <p className="text-xs font-mono tabular-nums">{val.toFixed(6)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    点击「转换」按钮查看结果
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== TAB: xy→RGB ==================== */}
        <TabsContent value="xy-to-rgb">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Input Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">xy→RGB 转换</CardTitle>
                <CardDescription>将 CIE xy 色度坐标转换为 RGB 值</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* xyY Inputs */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">CIE xyY 输入</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-muted-foreground">x</span>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.001}
                        value={xyInputX}
                        onChange={(e) => setXyInputX(clamp(parseFloat(e.target.value) || 0, 0, 1))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-muted-foreground">y</span>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.001}
                        value={xyInputY}
                        onChange={(e) => setXyInputY(clamp(parseFloat(e.target.value) || 0, 0, 1))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-muted-foreground">Y (亮度)</span>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={xyInputY2}
                        onChange={(e) => setXyInputY2(clamp(parseFloat(e.target.value) || 0, 0, 1))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Target */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">目标色彩空间</Label>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] text-muted-foreground">色域</span>
                      <Select value={xyTargetGamut} onValueChange={setXyTargetGamut}>
                        <SelectTrigger className="w-full h-8 text-xs" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getGamutNames().map((g) => (
                            <SelectItem key={g} value={g} className="text-xs">
                              {STANDARD_GAMUTS[g].name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] text-muted-foreground">传输函数</span>
                      <Select value={xyTargetTF} onValueChange={(v) => setXyTargetTF(v as TransferFunctionName)}>
                        <SelectTrigger className="w-full h-8 text-xs" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getTransferFunctionNames().map((tf) => (
                            <SelectItem key={tf} value={tf} className="text-xs">
                              {TRANSFER_FUNCTIONS[tf].name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Button onClick={handleXyToRgb} className="w-full" size="sm">
                  转换 / Convert
                </Button>
              </CardContent>
            </Card>

            {/* Output Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">转换结果 / Result</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {xyResult ? (
                  <>
                    {/* Color Swatch + Warning */}
                    <div className="flex items-center justify-center gap-4">
                      {xyResult.outOfGamut ? (
                        <div className="h-16 w-16 rounded-lg border-2 border-dashed border-destructive/50 bg-muted flex items-center justify-center">
                          <span className="text-[10px] text-destructive">超出色域</span>
                        </div>
                      ) : (
                        <ColorSwatch
                          r={xyResult.rgb[0]}
                          g={xyResult.rgb[1]}
                          b={xyResult.rgb[2]}
                          size="lg"
                          label="输出"
                        />
                      )}
                    </div>
                    {xyResult.outOfGamut && (
                      <Badge variant="destructive" className="self-center text-xs">
                        ⚠ 超出目标色域范围
                      </Badge>
                    )}

                    <Separator />

                    {/* Input xyY */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">输入 xyY</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['x', 'y', 'Y'] as const).map((ch) => {
                          const val = ch === 'x' ? xyInputX : ch === 'y' ? xyInputY : xyInputY2;
                          return (
                            <div key={ch} className="rounded-md border bg-muted/30 px-3 py-1.5 text-center">
                              <span className="text-[10px] text-muted-foreground font-medium">{ch}</span>
                              <p className="text-xs font-mono tabular-nums">{val.toFixed(6)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* XYZ intermediate */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">中间 XYZ</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['X', 'Y', 'Z'] as const).map((ch) => {
                          const val = ch === 'X' ? xyResult.xyz.X : ch === 'Y' ? xyResult.xyz.Y : xyResult.xyz.Z;
                          return (
                            <div key={ch} className="rounded-md border bg-muted/30 px-3 py-1.5 text-center">
                              <span className="text-[10px] text-muted-foreground font-medium">{ch}</span>
                              <p className="text-xs font-mono tabular-nums">{val.toFixed(6)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Output RGB */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">输出 RGB</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-md border bg-muted/30 px-3 py-1.5 text-center">
                          <span className="text-[10px] text-red-500 font-medium">R</span>
                          <p className="text-xs font-mono tabular-nums">{xyResult.rgb[0].toFixed(6)}</p>
                        </div>
                        <div className="rounded-md border bg-muted/30 px-3 py-1.5 text-center">
                          <span className="text-[10px] text-green-500 font-medium">G</span>
                          <p className="text-xs font-mono tabular-nums">{xyResult.rgb[1].toFixed(6)}</p>
                        </div>
                        <div className="rounded-md border bg-muted/30 px-3 py-1.5 text-center">
                          <span className="text-[10px] text-blue-500 font-medium">B</span>
                          <p className="text-xs font-mono tabular-nums">{xyResult.rgb[2].toFixed(6)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Hex */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Hex 颜色值</Label>
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-center">
                        <p className="text-sm font-mono font-semibold">{rgbToHex(xyResult.rgb[0], xyResult.rgb[1], xyResult.rgb[2])}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    点击「转换」按钮查看结果
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== TAB 2: 传输函数 ==================== */}
        <TabsContent value="transfer-func">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Controls */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">传输函数 / Transfer Function</CardTitle>
                <CardDescription>选择并可视化传输函数曲线</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* TF Selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">当前函数</Label>
                  <Select value={selectedTF} onValueChange={(v) => setSelectedTF(v as TransferFunctionName)}>
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getTransferFunctionNames().map((tf) => (
                        <SelectItem key={tf} value={tf} className="text-xs">
                          {TRANSFER_FUNCTIONS[tf].name} — {TRANSFER_FUNCTIONS[tf].description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {TRANSFER_FUNCTIONS[selectedTF].description}
                  </p>
                </div>

                {/* Custom Gamma */}
                {selectedTF === 'custom' && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">自定义 Gamma</Label>
                    <div className="flex items-center gap-3">
                      <Slider
                        value={[customGamma]}
                        onValueChange={([v]) => setCustomGamma(v)}
                        min={0.5}
                        max={4.0}
                        step={0.1}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={0.5}
                        max={4.0}
                        step={0.1}
                        value={customGamma}
                        onChange={(e) =>
                          setCustomGamma(clamp(parseFloat(e.target.value) || 2.2, 0.5, 4.0))
                        }
                        className="w-16 h-8 text-xs text-center"
                      />
                    </div>
                  </div>
                )}

                <Separator />

                {/* Input/Output Values */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">输入值</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={tfInputValue}
                    onChange={(e) =>
                      setTfInputValue(clamp(parseFloat(e.target.value) || 0, 0, 1))
                    }
                    className="h-8 text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border bg-muted/30 px-3 py-2">
                      <span className="text-[10px] text-muted-foreground">Encode →</span>
                      <p className="text-xs font-mono tabular-nums">{tfEncodedOutput.toFixed(6)}</p>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-3 py-2">
                      <span className="text-[10px] text-muted-foreground">Decode →</span>
                      <p className="text-xs font-mono tabular-nums">{tfDecodedOutput.toFixed(6)}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Overlay Selection */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">对比曲线 (多选)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {getTransferFunctionNames().map((tf, idx) => (
                      <Badge
                        key={tf}
                        variant={overlayTFs.includes(tf) ? 'default' : 'outline'}
                        className="cursor-pointer text-[10px] select-none"
                        style={
                          overlayTFs.includes(tf)
                            ? { backgroundColor: CHART_COLORS[idx % CHART_COLORS.length], color: '#fff', borderColor: CHART_COLORS[idx % CHART_COLORS.length] }
                            : {}
                        }
                        onClick={() => toggleOverlayTF(tf)}
                      >
                        {TRANSFER_FUNCTIONS[tf].name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">曲线可视化</CardTitle>
              </CardHeader>
              <CardContent>
                {multiCurveData && overlayTFs.length >= 2 ? (
                  <div className="h-[320px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={multiCurveData} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis
                          dataKey="input"
                          type="number"
                          domain={[0, 1]}
                          tick={{ fontSize: 10 }}
                          label={{ value: 'Input (Linear)', position: 'insideBottomRight', fontSize: 10, offset: -5 }}
                        />
                        <YAxis
                          domain={[0, 1]}
                          tick={{ fontSize: 10 }}
                          label={{ value: 'Output (Encoded)', position: 'insideTopLeft', fontSize: 10, angle: -90, offset: 10 }}
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 11 }}
                          formatter={(value: number) => value.toFixed(6)}
                          labelFormatter={(label: number) => `Input: ${label.toFixed(4)}`}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {overlayTFs.map((tf, idx) => (
                          <Line
                            key={tf}
                            type="monotone"
                            dataKey={TRANSFER_FUNCTIONS[tf].name}
                            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                            dot={false}
                            strokeWidth={2}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[320px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={tfCurveData} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis
                          dataKey="input"
                          type="number"
                          domain={[0, 1]}
                          tick={{ fontSize: 10 }}
                          label={{ value: 'Input (Linear)', position: 'insideBottomRight', fontSize: 10, offset: -5 }}
                        />
                        <YAxis
                          domain={[0, 1]}
                          tick={{ fontSize: 10 }}
                          label={{ value: 'Output (Encoded)', position: 'insideTopLeft', fontSize: 10, angle: -90, offset: 10 }}
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 11 }}
                          formatter={(value: number) => value.toFixed(6)}
                          labelFormatter={(label: number) => `Input: ${label.toFixed(4)}`}
                        />
                        <Line
                          type="monotone"
                          dataKey="output"
                          stroke="#8884d8"
                          dot={false}
                          strokeWidth={2}
                          name={TRANSFER_FUNCTIONS[selectedTF].name}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== TAB 3: Gamma ==================== */}
        <TabsContent value="gamma">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Controls */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Gamma 编码/解码</CardTitle>
                <CardDescription>独立 Gamma 函数运算，支持自定义值</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Gamma Value */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Gamma 值</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[gammaValue]}
                      onValueChange={([v]) => setGammaValue(v)}
                      min={0.5}
                      max={4.0}
                      step={0.1}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={0.5}
                      max={4.0}
                      step={0.1}
                      value={gammaValue}
                      onChange={(e) =>
                        setGammaValue(clamp(parseFloat(e.target.value) || 2.2, 0.5, 4.0))
                      }
                      className="w-16 h-8 text-xs text-center"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    γ = {gammaValue.toFixed(1)}
                  </p>
                </div>

                <Separator />

                {/* Input Value */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">输入值 (0 ~ 1)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={gammaInput}
                    onChange={(e) =>
                      setGammaInput(clamp(parseFloat(e.target.value) || 0, 0, 1))
                    }
                    className="h-8 text-xs"
                  />
                </div>

                {/* Mode & Calculate */}
                <div className="flex gap-2">
                  <Button
                    variant={gammaMode === 'encode' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setGammaMode('encode')}
                  >
                    编码 (Encode)
                  </Button>
                  <Button
                    variant={gammaMode === 'decode' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setGammaMode('decode')}
                  >
                    解码 (Decode)
                  </Button>
                </div>
                <Button onClick={handleGammaOp} className="w-full" size="sm">
                  计算
                </Button>

                {/* Result */}
                {gammaResult !== null && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      {gammaMode === 'encode' ? '编码结果' : '解码结果'}
                    </Label>
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-center">
                      <p className="text-xs text-muted-foreground">
                        {gammaMode === 'encode'
                          ? `V^(1/${gammaValue.toFixed(1)})`
                          : `V^${gammaValue.toFixed(1)}`}
                      </p>
                      <p className="text-sm font-mono font-semibold tabular-nums">
                        {gammaResult.toFixed(6)}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Gamma 曲线</CardTitle>
                <CardDescription>
                  V{' '}
                  <sup>
                    {gammaMode === 'encode' ? `1/${gammaValue.toFixed(1)}` : gammaValue.toFixed(1)}
                  </sup>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={gammaCurveData} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis
                        dataKey="input"
                        type="number"
                        domain={[0, 1]}
                        tick={{ fontSize: 10 }}
                        label={{ value: 'Input', position: 'insideBottomRight', fontSize: 10, offset: -5 }}
                      />
                      <YAxis
                        domain={[0, 1]}
                        tick={{ fontSize: 10 }}
                        label={{ value: 'Output', position: 'insideTopLeft', fontSize: 10, angle: -90, offset: 10 }}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 11 }}
                        formatter={(value: number) => value.toFixed(6)}
                        labelFormatter={(label: number) => `Input: ${label.toFixed(4)}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="output"
                        stroke="#8884d8"
                        dot={false}
                        strokeWidth={2}
                        name={`γ = ${gammaValue.toFixed(1)}`}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== TAB: 范围转换 ==================== */}
        <TabsContent value="video-range">
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Input Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">范围转换 / Range Conversion</CardTitle>
                  <CardDescription>支持 Full Range 和 Limited Range (TV Level) 之间的转换</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Source */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">源 (Source)</Label>
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1">
                        <span className="text-[10px] text-muted-foreground">色域</span>
                        <Select value={rangeSrcGamut} onValueChange={setRangeSrcGamut}>
                          <SelectTrigger className="w-full h-8 text-xs" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getGamutNames().map((g) => (
                              <SelectItem key={g} value={g} className="text-xs">
                                {STANDARD_GAMUTS[g].name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 space-y-1">
                        <span className="text-[10px] text-muted-foreground">传输函数</span>
                        <Select value={rangeSrcTF} onValueChange={(v) => setRangeSrcTF(v as TransferFunctionName)}>
                          <SelectTrigger className="w-full h-8 text-xs" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getTransferFunctionNames().map((tf) => (
                              <SelectItem key={tf} value={tf} className="text-xs">
                                {TRANSFER_FUNCTIONS[tf].name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <Button
                        variant={srcRange === 'full' ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => setSrcRange('full')}
                      >
                        Full Range
                      </Button>
                      <Button
                        variant={srcRange === 'limited' ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => setSrcRange('limited')}
                      >
                        Limited Range
                      </Button>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Target */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">目标 (Target)</Label>
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1">
                        <span className="text-[10px] text-muted-foreground">色域</span>
                        <Select value={rangeDstGamut} onValueChange={setRangeDstGamut}>
                          <SelectTrigger className="w-full h-8 text-xs" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getGamutNames().map((g) => (
                              <SelectItem key={g} value={g} className="text-xs">
                                {STANDARD_GAMUTS[g].name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 space-y-1">
                        <span className="text-[10px] text-muted-foreground">传输函数</span>
                        <Select value={rangeDstTF} onValueChange={(v) => setRangeDstTF(v as TransferFunctionName)}>
                          <SelectTrigger className="w-full h-8 text-xs" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getTransferFunctionNames().map((tf) => (
                              <SelectItem key={tf} value={tf} className="text-xs">
                                {TRANSFER_FUNCTIONS[tf].name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <Button
                        variant={dstRange === 'full' ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => setDstRange('full')}
                      >
                        Full Range
                      </Button>
                      <Button
                        variant={dstRange === 'limited' ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => setDstRange('limited')}
                      >
                        Limited Range
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {/* RGB Input */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">输入 RGB (0 ~ 1)</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <span className="text-[10px] font-medium text-red-500">R</span>
                        <Input
                          type="number" min={0} max={1} step={0.01} value={rangeInputR}
                          onChange={(e) => setRangeInputR(clamp(parseFloat(e.target.value) || 0, 0, 1))}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-medium text-green-500">G</span>
                        <Input
                          type="number" min={0} max={1} step={0.01} value={rangeInputG}
                          onChange={(e) => setRangeInputG(clamp(parseFloat(e.target.value) || 0, 0, 1))}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-medium text-blue-500">B</span>
                        <Input
                          type="number" min={0} max={1} step={0.01} value={rangeInputB}
                          onChange={(e) => setRangeInputB(clamp(parseFloat(e.target.value) || 0, 0, 1))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <Button onClick={handleRangeConvert} className="w-full" size="sm">
                    转换 / Convert
                  </Button>
                </CardContent>
              </Card>

              {/* Output Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">转换结果 / Result</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {rangeResult ? (
                    <>
                      {/* Color Swatches */}
                      <div className="flex items-center justify-center gap-4">
                        <ColorSwatch r={rangeInputR} g={rangeInputG} b={rangeInputB} size="md" label="输入" />
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <ColorSwatch r={rangeResult.intermediateRGB[0]} g={rangeResult.intermediateRGB[1]} b={rangeResult.intermediateRGB[2]} size="md" label="中间" />
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <ColorSwatch r={rangeResult.outputRGB[0]} g={rangeResult.outputRGB[1]} b={rangeResult.outputRGB[2]} size="md" label="输出" />
                      </div>

                      <Separator />

                      {/* Output RGB */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">输出 RGB</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['R', 'G', 'B'] as const).map((ch, i) => (
                            <div key={ch} className="rounded-md border bg-muted/30 px-3 py-1.5 text-center">
                              <span className={`text-[10px] font-medium ${ch === 'R' ? 'text-red-500' : ch === 'G' ? 'text-green-500' : 'text-blue-500'}`}>{ch}</span>
                              <p className="text-xs font-mono tabular-nums">{rangeResult.outputRGB[i].toFixed(6)}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Intermediate (full range) */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">中间 RGB (Full Range)</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['R', 'G', 'B'] as const).map((ch, i) => (
                            <div key={ch} className="rounded-md border bg-muted/30 px-3 py-1.5 text-center">
                              <span className="text-[10px] text-muted-foreground font-medium">{ch}</span>
                              <p className="text-xs font-mono tabular-nums">{rangeResult.intermediateRGB[i].toFixed(6)}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 8-bit values */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">8-bit 值 (0-255)</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-md border bg-muted/30 px-3 py-1.5 text-center">
                            <span className="text-[10px] text-muted-foreground">输入</span>
                            <p className="text-xs font-mono tabular-nums">
                              {Math.round(rangeInputR * 255)}, {Math.round(rangeInputG * 255)}, {Math.round(rangeInputB * 255)}
                            </p>
                          </div>
                          <div className="rounded-md border bg-muted/30 px-3 py-1.5 text-center">
                            <span className="text-[10px] text-muted-foreground">输出</span>
                            <p className="text-xs font-mono tabular-nums">
                              {Math.round(rangeResult.outputRGB[0] * 255)}, {Math.round(rangeResult.outputRGB[1] * 255)}, {Math.round(rangeResult.outputRGB[2] * 255)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Info */}
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Full Range: 0-255 (PC Level) | Limited Range: 16-235 (TV Level, 8-bit)
                      </p>
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                      点击「转换」按钮查看结果
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Range Curve Chart */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">范围转换曲线</CardTitle>
                <CardDescription>Full Range 到 Limited Range 的映射关系</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rangeCurveData} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis
                        dataKey="input"
                        type="number"
                        domain={[0, 1]}
                        tick={{ fontSize: 10 }}
                        label={{ value: '输入值 (Full Range 0-1)', position: 'insideBottomRight', fontSize: 10, offset: -5 }}
                      />
                      <YAxis
                        domain={[0, 1]}
                        tick={{ fontSize: 10 }}
                        label={{ value: '输出值', position: 'insideTopLeft', fontSize: 10, angle: -90, offset: 10 }}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 11 }}
                        formatter={(value: number) => value.toFixed(6)}
                        labelFormatter={(label: number) => `Input: ${label.toFixed(4)}`}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        type="monotone"
                        dataKey="fullRange"
                        stroke="#82ca9d"
                        dot={false}
                        strokeWidth={2}
                        name="Full Range"
                      />
                      <Line
                        type="monotone"
                        dataKey="limitedRange"
                        stroke="#8884d8"
                        dot={false}
                        strokeWidth={2}
                        name="Limited Range"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== TAB 4: 矩阵运算 ==================== */}
        <TabsContent value="matrix-ops">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Controls */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">RGB ↔ XYZ 矩阵</CardTitle>
                <CardDescription>查看和组合色彩空间的转换矩阵</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">色域选择</Label>
                  <Select value={matrixGamut} onValueChange={setMatrixGamut}>
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getGamutNames().map((g) => (
                        <SelectItem key={g} value={g} className="text-xs">
                          {STANDARD_GAMUTS[g].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {matricesData && (
                  <div className="space-y-4">
                    <MatrixDisplay matrix={matricesData.rgbToXYZ} title="RGB → XYZ 矩阵" />
                    <MatrixDisplay matrix={matricesData.xyzToRGB} title="XYZ → RGB 矩阵" />
                  </div>
                )}

                {/* Chromaticity coordinates */}
                {matricesData && (() => {
                  const g = STANDARD_GAMUTS[matrixGamut];
                  if (!g) return null;
                  return (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">色坐标 / Chromaticity Coordinates</p>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] w-8 text-red-500 font-medium">R</span>
                          <span>x={g.red.x.toFixed(4)} y={g.red.y.toFixed(4)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] w-8 text-green-500 font-medium">G</span>
                          <span>x={g.green.x.toFixed(4)} y={g.green.y.toFixed(4)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] w-8 text-blue-500 font-medium">B</span>
                          <span>x={g.blue.x.toFixed(4)} y={g.blue.y.toFixed(4)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] w-8 font-medium">W</span>
                          <span>x={g.white.x.toFixed(4)} y={g.white.y.toFixed(4)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Combined Matrix */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">组合矩阵 / Combined</CardTitle>
                <CardDescription>计算两个色域之间的直接转换矩阵</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Switch checked={showCombined} onCheckedChange={setShowCombined} id="combined-switch" />
                  <Label htmlFor="combined-switch" className="text-xs">
                    显示组合矩阵
                  </Label>
                </div>

                {showCombined && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-muted-foreground">源色域 A</span>
                        <Select value={matrixGamut} onValueChange={setMatrixGamut}>
                          <SelectTrigger className="w-full h-8 text-xs" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getGamutNames().map((g) => (
                              <SelectItem key={g} value={g} className="text-xs">
                                {STANDARD_GAMUTS[g].name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground mb-0.5" />
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-muted-foreground">目标色域 B</span>
                        <Select value={matrixGamutB} onValueChange={setMatrixGamutB}>
                          <SelectTrigger className="w-full h-8 text-xs" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getGamutNames().map((g) => (
                              <SelectItem key={g} value={g} className="text-xs">
                                {STANDARD_GAMUTS[g].name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      M = XYZ→RGB(B) × RGB→XYZ(A)
                    </p>

                    {combinedMatrix && (
                      <MatrixDisplay
                        matrix={combinedMatrix}
                        title={`RGB(A) → RGB(B): ${STANDARD_GAMUTS[matrixGamut]?.name} → ${STANDARD_GAMUTS[matrixGamutB]?.name}`}
                      />
                    )}
                  </div>
                )}

                {!showCombined && (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    开启开关以查看组合矩阵
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== TAB 5: 参数预设 ==================== */}
        <TabsContent value="param-presets">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">参数预设 / Parameter Presets</CardTitle>
              <CardDescription>
                常用 Gamma + 色域组合预设，点击可将源色域和传输函数应用到色域转换
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[520px] overflow-y-auto pr-1">
                {PRESETS.map((preset) => (
                  <Card
                    key={preset.name}
                    className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md py-4"
                    onClick={() => applyPreset(preset)}
                  >
                    <CardContent className="p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Palette className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-semibold">{preset.name}</span>
                        </div>
                        {preset.badge && (
                          <Badge variant="secondary" className="text-[10px]">
                            {preset.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {preset.description}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {STANDARD_GAMUTS[preset.gamut]?.name || preset.gamut}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {TRANSFER_FUNCTIONS[preset.tf].name}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground/60">
                        点击应用 → 色域转换
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== TAB 6: 参数联动/锁定 ==================== */}
        <TabsContent value="param-lock">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Sliders */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">RGB 联动调节</CardTitle>
                <CardDescription>拖动滑块调整 RGB 值，开启联动模式锁定三通道</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Lock Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {linkedMode ? (
                      <Link className="h-4 w-4 text-primary" />
                    ) : (
                      <Unlock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Label className="text-xs font-medium">
                      联动模式 (R = G = B)
                    </Label>
                  </div>
                  <Switch checked={linkedMode} onCheckedChange={setLinkedMode} id="link-switch" />
                </div>

                <Separator />

                {/* R Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-red-500">R (Red)</span>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">
                      {paramR.toFixed(4)}
                    </span>
                  </div>
                  <Slider
                    value={[paramR]}
                    onValueChange={([v]) => handleLinkedChange('R', v)}
                    min={0}
                    max={1}
                    step={0.005}
                    className="w-full [&_[data-slot=slider-range]]:bg-red-500 [&_[data-slot=slider-thumb]]:border-red-500"
                  />
                </div>

                {/* G Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-green-500">G (Green)</span>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">
                      {paramG.toFixed(4)}
                    </span>
                  </div>
                  <Slider
                    value={[paramG]}
                    onValueChange={([v]) => handleLinkedChange('G', v)}
                    min={0}
                    max={1}
                    step={0.005}
                    className="w-full [&_[data-slot=slider-range]]:bg-green-500 [&_[data-slot=slider-thumb]]:border-green-500"
                  />
                </div>

                {/* B Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-500">B (Blue)</span>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">
                      {paramB.toFixed(4)}
                    </span>
                  </div>
                  <Slider
                    value={[paramB]}
                    onValueChange={([v]) => handleLinkedChange('B', v)}
                    min={0}
                    max={1}
                    step={0.005}
                    className="w-full [&_[data-slot=slider-range]]:bg-blue-500 [&_[data-slot=slider-thumb]]:border-blue-500"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Preview & Presets */}
            <div className="space-y-4">
              {/* Color Preview */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">颜色预览</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  <div
                    className="h-28 w-28 rounded-xl border border-border shadow-lg"
                    style={{
                      backgroundColor: `rgb(${clamp(Math.round(paramR * 255), 0, 255)}, ${clamp(Math.round(paramG * 255), 0, 255)}, ${clamp(Math.round(paramB * 255), 0, 255)})`,
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono font-semibold">{paramHex.toUpperCase()}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleCopyHex}
                    >
                      {copiedHex ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    R: {(paramR * 255).toFixed(0)} &nbsp; G: {(paramG * 255).toFixed(0)} &nbsp; B:{' '}
                    {(paramB * 255).toFixed(0)}
                  </p>
                </CardContent>
              </Card>

              {/* Quick Presets */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">快捷预设</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { name: '红', r: 1, g: 0, b: 0 },
                      { name: '绿', r: 0, g: 1, b: 0 },
                      { name: '蓝', r: 0, g: 0, b: 1 },
                      { name: '白', r: 1, g: 1, b: 1 },
                      { name: '黑', r: 0, g: 0, b: 0 },
                      { name: '灰', r: 0.5, g: 0.5, b: 0.5 },
                    ].map((preset) => (
                      <Button
                        key={preset.name}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1.5 text-xs"
                        onClick={() => {
                          setParamR(preset.r);
                          setParamG(preset.g);
                          setParamB(preset.b);
                        }}
                      >
                        <ColorSwatch r={preset.r} g={preset.g} b={preset.b} size="sm" />
                        {preset.name}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
