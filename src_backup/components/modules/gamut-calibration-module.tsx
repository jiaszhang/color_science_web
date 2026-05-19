'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/lib/store/app-store';
import {
  STANDARD_GAMUTS,
  getGamutNames,
  rgbToXYZMatrix,
  formatMatrix,
  gamutCoverage,
  colorTempToXY,
  xyToColorTemp,
  calculateDuv,
  WHITE_POINT_PRESETS,
  generatePlanckianLocus,
  generateCalibrationLUT,
  getGamutTriangle,
  spectralLocusSVGPath,
  planckianLocusSVGPath,
  type TransferFunctionName,
} from '@/lib/color-science';
import { getTransferFunctionNames } from '@/lib/color-science/tf-gamma';
import { rgbToXYZ, xyzToRgb, xyzToXyY } from '@/lib/color-science/transform';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  BarChart,
  Bar,
} from 'recharts';

export default function GamutCalibrationModule() {
  const { activeTab, setActiveTab, addLUT } = useAppStore();
  const currentTab = ['gamut-calc', 'gamut-coverage', 'color-temp', 'calibration', 'measurement'].includes(activeTab) ? activeTab : 'gamut-calc';
  const [srcGamut, setSrcGamut] = useState('sRGB');
  const [dstGamut, setDstGamut] = useState('DCI_P3');
  const [srcTF, setSrcTF] = useState<TransferFunctionName>('sRGB');
  const [dstTF, setDstTF] = useState<TransferFunctionName>('sRGB');
  const [inputR, setInputR] = useState(0.8);
  const [inputG, setInputG] = useState(0.2);
  const [inputB, setInputB] = useState(0.1);
  const [convertResult, setConvertResult] = useState<{
    xyz: { X: number; Y: number; Z: number };
    outRgb: number[];
    xyY: { x: number; y: number; Y: number };
  } | null>(null);
  const [covSource, setCovSource] = useState('DCI_P3');
  const [covRef, setCovRef] = useState('Rec2020');
  const [covResult, setCovResult] = useState<{
    coverage: number;
    volumeSource: number;
    volumeReference: number;
    volumeIntersection: number;
  } | null>(null);
  const [colorTemp, setColorTemp] = useState(6504);
  const [wpX, setWpX] = useState(0.3127);
  const [wpY, setWpY] = useState(0.3290);
  const [calTargetGamut, setCalTargetGamut] = useState('sRGB');
  const [calTargetTF, setCalTargetTF] = useState<TransferFunctionName>('sRGB');
  const [calWhitePoint, setCalWhitePoint] = useState('D65');
  const [calLuminance, setCalLuminance] = useState(100);
  const [calGridSize, setCalGridSize] = useState(33);
  const [calResult, setCalResult] = useState<string | null>(null);
  const [measureData, setMeasureData] = useState<
    { name: string; x: number; y: number; L: number }[]
  >([]);
  const [measureInput, setMeasureInput] = useState('');

  const gamutNames = useMemo(() => getGamutNames(), []);
  const tfNames = useMemo(() => getTransferFunctionNames(), []);

  // Selected white point preset key
  const [selectedPreset, setSelectedPreset] = useState<string>('D65');

  // Spectral locus + Planckian locus SVG paths (memoized)
  const spectralPath = useMemo(() => spectralLocusSVGPath(500, 500), []);
  const planckianPath = useMemo(() => planckianLocusSVGPath(500, 500, 1000, 10000, 80), []);

  const handleConvert = useCallback(() => {
    const xyz = rgbToXYZ(inputR, inputG, inputB, srcGamut, srcTF);
    const outRgb = xyzToRgb(xyz.X, xyz.Y, xyz.Z, dstGamut, dstTF);
    const xyY = xyzToXyY(xyz.X, xyz.Y, xyz.Z);
    setConvertResult({ xyz, outRgb, xyY });
  }, [inputR, inputG, inputB, srcGamut, srcTF, dstGamut, dstTF]);

  const srcMatrix = useMemo(() => {
    const g = STANDARD_GAMUTS[srcGamut];
    if (!g) return null;
    return rgbToXYZMatrix(g.red, g.green, g.blue, g.white);
  }, [srcGamut]);

  const dstMatrix = useMemo(() => {
    const g = STANDARD_GAMUTS[dstGamut];
    if (!g) return null;
    return rgbToXYZMatrix(g.red, g.green, g.blue, g.white);
  }, [dstGamut]);

  const handleCalculateCoverage = useCallback(() => {
    const result = gamutCoverage(covSource, covRef, 100);
    setCovResult(result);
  }, [covSource, covRef]);

  const planckianLocus = useMemo(
    () => generatePlanckianLocus(1000, 10000, 80),
    []
  );

  const tempToXY = useMemo(() => colorTempToXY(colorTemp), [colorTemp]);
  const xyToTemp = useMemo(() => xyToColorTemp(wpX, wpY), [wpX, wpY]);
  const duv = useMemo(() => calculateDuv(wpX, wpY), [wpX, wpY]);

  const sourceTriangle = useMemo(() => getGamutTriangle(covSource), [covSource]);
  const refTriangle = useMemo(() => getGamutTriangle(covRef), [covRef]);

  const [calGenerating, setCalGenerating] = useState(false);

  const handleCalibrate = useCallback(() => {
    setCalGenerating(true);
    setCalResult(null);

    // Get white point from preset or custom
    const wpPreset = WHITE_POINT_PRESETS[calWhitePoint];
    const targetWP = wpPreset
      ? { x: wpPreset.x, y: wpPreset.y }
      : { x: wpX, y: wpY };

    try {
      const lut = generateCalibrationLUT(
        calGridSize,
        calTargetGamut,
        calTargetTF,
        targetWP,
        calLuminance,
      );

      // Add to LUT library
      const id = `cal_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      addLUT(id, {
        name: `校准 LUT: sRGB → ${calTargetGamut} (${calWhitePoint})`,
        size: lut.size,
        data: lut.data,
        srcGamut: 'sRGB',
        dstGamut: calTargetGamut,
      });

      setCalResult(
        `校准 LUT 已生成并添加到 LUT 库。\n大小: ${lut.size}³ | 条目: ${(lut.size ** 3).toLocaleString()} | 数据: ${(lut.data.byteLength / 1024).toFixed(1)} KB`
      );
    } catch (err) {
      setCalResult(`生成失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setCalGenerating(false);
    }
  }, [calGridSize, calTargetGamut, calTargetTF, calWhitePoint, calLuminance, wpX, wpY, addLUT]);

  const handleParseMeasure = useCallback(() => {
    const lines = measureInput.trim().split('\n');
    const parsed: { name: string; x: number; y: number; L: number }[] = [];
    for (const line of lines) {
      const parts = line.trim().split(/[\s,]+/);
      if (parts.length >= 4) {
        const name = parts[0];
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        const L = parseFloat(parts[3]);
        if (!isNaN(x) && !isNaN(y) && !isNaN(L)) {
          parsed.push({ name, x, y, L });
        }
      }
    }
    setMeasureData(parsed);
  }, [measureInput]);

  const handleAddMeasurePoint = useCallback(() => {
    setMeasureData((prev) => [
      ...prev,
      { name: `Point_${prev.length + 1}`, x: 0.3127, y: 0.3290, L: 100 },
    ]);
  }, []);

  const planckianData = useMemo(
    () =>
      planckianLocus.map((p) => ({
        x: parseFloat(p.x.toFixed(4)),
        y: parseFloat(p.y.toFixed(4)),
        temp: p.temp,
      })),
    [planckianLocus]
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <Tabs value={currentTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1">
          <TabsTrigger value="gamut-calc" className="text-xs">色域转换计算</TabsTrigger>
          <TabsTrigger value="gamut-coverage" className="text-xs">色域覆盖率</TabsTrigger>
          <TabsTrigger value="color-temp" className="text-xs">色温/白点</TabsTrigger>
          <TabsTrigger value="calibration" className="text-xs">校准</TabsTrigger>
          <TabsTrigger value="measurement" className="text-xs">测量数据</TabsTrigger>
        </TabsList>

        {/* ===== TAB 1: 色域转换计算 ===== */}
        <TabsContent value="gamut-calc" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">色域转换计算</CardTitle>
                <CardDescription>在任意两个标准色域间进行精确的 RGB 值转换</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">源色域</Label>
                    <Select value={srcGamut} onValueChange={setSrcGamut}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {gamutNames.map((g) => (
                          <SelectItem key={g} value={g} className="text-xs">
                            {STANDARD_GAMUTS[g]?.name || g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">源传输函数</Label>
                    <Select value={srcTF} onValueChange={(v) => setSrcTF(v as TransferFunctionName)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tfNames.map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">目标色域</Label>
                    <Select value={dstGamut} onValueChange={setDstGamut}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {gamutNames.map((g) => (
                          <SelectItem key={g} value={g} className="text-xs">
                            {STANDARD_GAMUTS[g]?.name || g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">目标传输函数</Label>
                    <Select value={dstTF} onValueChange={(v) => setDstTF(v as TransferFunctionName)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tfNames.map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs">输入 RGB (0-1)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] text-red-500">R</Label>
                      <Input type="number" step="0.01" min="0" max="1" value={inputR} onChange={(e) => setInputR(parseFloat(e.target.value) || 0)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-green-500">G</Label>
                      <Input type="number" step="0.01" min="0" max="1" value={inputG} onChange={(e) => setInputG(parseFloat(e.target.value) || 0)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-blue-500">B</Label>
                      <Input type="number" step="0.01" min="0" max="1" value={inputB} onChange={(e) => setInputB(parseFloat(e.target.value) || 0)} className="h-8 text-xs" />
                    </div>
                  </div>
                </div>
                <Button onClick={handleConvert} className="w-full h-8 text-xs" size="sm">
                  转换
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">转换结果</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Color Swatches */}
                <div className="flex gap-4 items-center">
                  <div className="text-center">
                    <div
                      className="w-16 h-16 rounded-lg border shadow-sm"
                      style={{
                        backgroundColor: `rgb(${Math.round(inputR * 255)},${Math.round(inputG * 255)},${Math.round(inputB * 255)})`,
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground mt-1 block">输入</span>
                  </div>
                  <div className="text-2xl text-muted-foreground">→</div>
                  <div className="text-center">
                    <div
                      className="w-16 h-16 rounded-lg border shadow-sm"
                      style={{
                        backgroundColor: convertResult
                          ? `rgb(${Math.round(Math.max(0, Math.min(1, convertResult.outRgb[0])) * 255)},${Math.round(Math.max(0, Math.min(1, convertResult.outRgb[1])) * 255)},${Math.round(Math.max(0, Math.min(1, convertResult.outRgb[2])) * 255)})`
                          : '#333',
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground mt-1 block">输出</span>
                  </div>
                </div>

                {convertResult && (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                      <p className="text-xs font-medium">XYZ (线性)</p>
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                        <span>X: {convertResult.xyz.X.toFixed(6)}</span>
                        <span>Y: {convertResult.xyz.Y.toFixed(6)}</span>
                        <span>Z: {convertResult.xyz.Z.toFixed(6)}</span>
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                      <p className="text-xs font-medium">目标 RGB</p>
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                        <span className="text-red-500">R: {convertResult.outRgb[0].toFixed(6)}</span>
                        <span className="text-green-500">G: {convertResult.outRgb[1].toFixed(6)}</span>
                        <span className="text-blue-500">B: {convertResult.outRgb[2].toFixed(6)}</span>
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                      <p className="text-xs font-medium">xyY 色度坐标</p>
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                        <span>x: {convertResult.xyY.x.toFixed(6)}</span>
                        <span>y: {convertResult.xyY.y.toFixed(6)}</span>
                        <span>Y: {convertResult.xyY.Y.toFixed(6)}</span>
                      </div>
                    </div>
                    {/* Out of gamut warning */}
                    {(convertResult.outRgb[0] < 0 || convertResult.outRgb[0] > 1 ||
                      convertResult.outRgb[1] < 0 || convertResult.outRgb[1] > 1 ||
                      convertResult.outRgb[2] < 0 || convertResult.outRgb[2] > 1) && (
                      <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2">
                        <p className="text-xs text-destructive font-medium">⚠ 色域外：输出值超出目标色域范围，已裁切</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Matrix Display */}
          {srcMatrix && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">RGB ↔ XYZ 矩阵</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium mb-2">
                      {STANDARD_GAMUTS[srcGamut]?.name || srcGamut} RGB → XYZ
                    </p>
                    <pre className="bg-muted/50 rounded-lg p-3 text-[11px] font-mono overflow-x-auto">
                      {formatMatrix(srcMatrix, 6)}
                    </pre>
                  </div>
                  {dstMatrix && (
                    <div>
                      <p className="text-xs font-medium mb-2">
                        {STANDARD_GAMUTS[dstGamut]?.name || dstGamut} RGB → XYZ
                      </p>
                      <pre className="bg-muted/50 rounded-lg p-3 text-[11px] font-mono overflow-x-auto">
                        {formatMatrix(dstMatrix, 6)}
                      </pre>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== TAB 2: 色域覆盖率 ===== */}
        <TabsContent value="gamut-coverage" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">色域覆盖率计算</CardTitle>
                <CardDescription>使用 Monte Carlo 方法估算色域体积和覆盖率</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">源色域</Label>
                    <Select value={covSource} onValueChange={setCovSource}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {gamutNames.map((g) => (
                          <SelectItem key={g} value={g} className="text-xs">{STANDARD_GAMUTS[g]?.name || g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">参考色域</Label>
                    <Select value={covRef} onValueChange={setCovRef}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {gamutNames.map((g) => (
                          <SelectItem key={g} value={g} className="text-xs">{STANDARD_GAMUTS[g]?.name || g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleCalculateCoverage} className="w-full h-8 text-xs" size="sm">
                  计算覆盖率
                </Button>
                {covResult && (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">覆盖率</p>
                      <p className="text-2xl font-bold">{covResult.coverage.toFixed(1)}%</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-muted/30 p-2">
                        <p className="text-[10px] text-muted-foreground">源体积</p>
                        <p className="text-sm font-semibold">{covResult.volumeSource.toFixed(1)}%</p>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-2">
                        <p className="text-[10px] text-muted-foreground">参考体积</p>
                        <p className="text-sm font-semibold">{covResult.volumeReference.toFixed(1)}%</p>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-2">
                    <p className="text-[10px] text-muted-foreground">交叉体积</p>
                    <p className="text-sm font-semibold">{covResult.volumeIntersection.toFixed(1)}%</p>
                  </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* CIE Diagram SVG */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">CIE xy 色度图</CardTitle>
              </CardHeader>
              <CardContent>
                <svg viewBox="0 0 500 500" className="w-full max-w-md mx-auto">
                  {/* Background */}
                  <rect x="0" y="0" width="500" height="500" fill="#fafafa" rx="8" />
                  {/* Spectral locus (horseshoe outline) */}
                  {spectralPath && (
                    <polyline
                      points={spectralPath}
                      fill="none"
                      stroke="#aaa"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  )}
                  {/* Planckian locus */}
                  {planckianPath && (
                    <polyline
                      points={planckianPath}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="6 3"
                    />
                  )}
                  {/* Grid lines */}
                  {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((v) => (
                    <React.Fragment key={`grid-${v}`}>
                      <line x1={v * 500} y1="0" x2={v * 500} y2="500" stroke="#e5e5e5" strokeWidth="0.5" />
                      <line x1="0" y1={(1 - v) * 500} x2="500" y2={(1 - v) * 500} stroke="#e5e5e5" strokeWidth="0.5" />
                    </React.Fragment>
                  ))}
                  {/* Reference gamut triangle */}
                  {refTriangle && refTriangle.length >= 3 && (
                    <polygon
                      points={refTriangle.slice(0, 3).map((p) => `${p.x * 500},${(1 - p.y) * 500}`).join(' ')}
                      fill="rgba(59,130,246,0.08)"
                      stroke="rgba(59,130,246,0.5)"
                      strokeWidth="2"
                    />
                  )}
                  {/* Source gamut triangle */}
                  {sourceTriangle && sourceTriangle.length >= 3 && (
                    <polygon
                      points={sourceTriangle.slice(0, 3).map((p) => `${p.x * 500},${(1 - p.y) * 500}`).join(' ')}
                      fill="rgba(239,68,68,0.08)"
                      stroke="rgba(239,68,68,0.5)"
                      strokeWidth="2"
                    />
                  )}
                  {/* White point */}
                  {refTriangle && refTriangle.length >= 4 && (
                    <circle
                      cx={refTriangle[3].x * 500}
                      cy={(1 - refTriangle[3].y) * 500}
                      r="4"
                      fill="#666"
                    />
                  )}
                  {/* Axes labels */}
                  <text x="490" y="495" textAnchor="end" fontSize="9" fill="#888">x</text>
                  <text x="5" y="8" fontSize="9" fill="#888">y</text>
                  {/* Legend box */}
                  <rect x="6" y="6" width="108" height="52" fill="rgba(255,255,255,0.88)" stroke="#ddd" strokeWidth="0.5" rx="4" />
                  <line x1="12" y1="18" x2="28" y2="18" stroke="#aaa" strokeWidth="1.5" />
                  <text x="32" y="21" fontSize="8" fill="#666">光谱轨迹</text>
                  <line x1="12" y1="32" x2="28" y2="32" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 2" />
                  <text x="32" y="35" fontSize="8" fill="#666">普朗克轨迹</text>
                  <rect x="12" y="42" width="10" height="6" fill="rgba(239,68,68,0.3)" stroke="rgba(239,68,68,0.6)" strokeWidth="0.5" rx="1" />
                  <rect x="24" y="42" width="10" height="6" fill="rgba(59,130,246,0.3)" stroke="rgba(59,130,246,0.6)" strokeWidth="0.5" rx="1" />
                  <text x="38" y="48" fontSize="8" fill="#666">色域</text>
                </svg>
              </CardContent>
            </Card>
          </div>

          {/* Bar Chart */}
          {covResult && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">体积对比</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: '源色域', value: covResult.volumeSource, fill: '#ef4444' },
                      { name: '参考色域', value: covResult.volumeReference, fill: '#3b82f6' },
                      { name: '交叉', value: covResult.volumeIntersection, fill: '#8b5cf6' },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== TAB 3: 色温/白点 ===== */}
        <TabsContent value="color-temp" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">色温 ↔ 色度坐标</CardTitle>
                <CardDescription>在色温(Kelvin)和 CIE xy 白点坐标之间相互转换</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Temperature slider — logarithmic 1000K-10000K */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">色温 (K)</Label>
                    <Input
                      type="number"
                      value={colorTemp}
                      onChange={(e) => setColorTemp(Math.max(1000, Math.min(10000, parseInt(e.target.value) || 1000)))}
                      className="w-20 h-7 text-xs text-right font-mono"
                      min={1000}
                      max={10000}
                      step={1}
                    />
                  </div>
                  <Slider
                    value={[colorTemp]}
                    onValueChange={(v) => setColorTemp(v[0])}
                    min={1000}
                    max={10000}
                    step={1}
                  />
                  <div className="relative h-4 mx-2">
                    <span className="absolute left-0 text-[10px] text-muted-foreground">1000K</span>
                    <span
                      className="absolute text-[10px] text-muted-foreground -translate-x-1/2"
                      style={{ left: `${((2500 - 1000) / 9000) * 100}%` }}
                    >2500K</span>
                    <span
                      className="absolute text-[10px] text-muted-foreground -translate-x-1/2"
                      style={{ left: `${((5000 - 1000) / 9000) * 100}%` }}
                    >5000K</span>
                    <span
                      className="absolute text-[10px] text-muted-foreground -translate-x-1/2"
                      style={{ left: `${((7500 - 1000) / 9000) * 100}%` }}
                    >7500K</span>
                    <span className="absolute right-0 text-[10px] text-muted-foreground">10000K</span>
                  </div>
                </div>

                <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                  <p className="text-xs font-medium">{colorTemp}K → xy</p>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <span>x: {tempToXY.x.toFixed(6)}</span>
                    <span>y: {tempToXY.y.toFixed(6)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div
                      className="w-8 h-8 rounded border"
                      style={{
                        backgroundColor: `rgb(${Math.round(tempToXY.x * 400)},${Math.round(tempToXY.y * 400)},${Math.round((1 - tempToXY.x - tempToXY.y) * 200 + 50)})`,
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">近似颜色</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-xs">xy → 色温</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">x</Label>
                      <Input type="number" step="0.0001" value={wpX} onChange={(e) => setWpX(parseFloat(e.target.value) || 0)} className="h-8 text-xs font-mono" />
                    </div>
                    <div>
                      <Label className="text-[10px]">y</Label>
                      <Input type="number" step="0.0001" value={wpY} onChange={(e) => setWpY(parseFloat(e.target.value) || 0)} className="h-8 text-xs font-mono" />
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-xs font-mono">
                    <p>色温: {xyToTemp}K</p>
                    <p>Duv: {duv.toFixed(4)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* White Point Presets */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">标准白点预设</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(WHITE_POINT_PRESETS).map(([key, wp]) => (
                    <Button
                      key={key}
                      variant={selectedPreset === key ? 'default' : 'outline'}
                      className="h-auto py-2 flex flex-col items-start gap-1"
                      onClick={() => {
                        setWpX(wp.x);
                        setWpY(wp.y);
                        setColorTemp(Math.min(10000, wp.temp));
                        setSelectedPreset(key);
                      }}
                    >
                      <span className="text-xs font-medium">{wp.name}</span>
                      <span className="text-[10px] opacity-70">{wp.temp}K</span>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Planckian Locus Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">普朗克轨迹 (Planckian Locus)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="x"
                      type="number"
                      domain={[0.15, 0.75]}
                      tick={{ fontSize: 10 }}
                      label={{ value: 'x', position: 'bottom', fontSize: 11 }}
                    />
                    <YAxis
                      dataKey="y"
                      type="number"
                      domain={[0.05, 0.85]}
                      tick={{ fontSize: 10 }}
                      label={{ value: 'y', angle: -90, position: 'insideLeft', fontSize: 11 }}
                    />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-background border rounded-lg p-2 shadow-lg text-xs">
                            <p>K: {d.temp}K</p>
                            <p>x: {d.x} y: {d.y}</p>
                          </div>
                        );
                      }}
                    />
                    <Scatter
                      data={planckianData}
                      fill="#f59e0b"
                      line={{ stroke: '#f59e0b', strokeWidth: 2 }}
                      shape="circle"
                    />
                    {/* Current point */}
                    <Scatter
                      data={[{ x: parseFloat(tempToXY.x.toFixed(4)), y: parseFloat(tempToXY.y.toFixed(4)), temp: colorTemp }]}
                      fill="#ef4444"
                      shape="circle"
                    />
                    {/* Current xy input point */}
                    <Scatter
                      data={[{ x: wpX, y: wpY, temp: xyToTemp }]}
                      fill="#3b82f6"
                      shape="diamond"
                    />
                    <Legend
                      payload={[
                        { value: '普朗克轨迹', type: 'line', color: '#f59e0b' },
                        { value: `${colorTemp}K`, type: 'circle', color: '#ef4444' },
                        { value: `自定义 (${wpX}, ${wpY})`, type: 'diamond', color: '#3b82f6' },
                      ]}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB 4: 校准 ===== */}
        <TabsContent value="calibration" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">校准 3D LUT 生成</CardTitle>
                <CardDescription>根据目标色域、传输函数和白点生成校准 LUT</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">目标色域</Label>
                  <Select value={calTargetGamut} onValueChange={setCalTargetGamut}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {gamutNames.map((g) => (
                        <SelectItem key={g} value={g} className="text-xs">{STANDARD_GAMUTS[g]?.name || g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">目标传输函数</Label>
                  <Select value={calTargetTF} onValueChange={(v) => setCalTargetTF(v as TransferFunctionName)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {tfNames.map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">目标白点</Label>
                  <Select value={calWhitePoint} onValueChange={setCalWhitePoint}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(WHITE_POINT_PRESETS).map(([key, wp]) => (
                        <SelectItem key={key} value={key} className="text-xs">{wp.name} ({wp.temp}K)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">峰值亮度 (nits)</Label>
                  <Input
                    type="number"
                    value={calLuminance}
                    onChange={(e) => setCalLuminance(parseInt(e.target.value) || 100)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">网格大小</Label>
                  <Select value={String(calGridSize)} onValueChange={(v) => setCalGridSize(parseInt(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="17" className="text-xs">17³ (4,913 点)</SelectItem>
                      <SelectItem value="33" className="text-xs">33³ (35,937 点)</SelectItem>
                      <SelectItem value="65" className="text-xs">65³ (274,625 点)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="rounded-lg bg-muted/50 p-2 text-[11px]">
                  <p className="font-medium mb-1">当前显示配置</p>
                  <p>色域: sRGB | TF: sRGB</p>
                </div>
                <Button onClick={handleCalibrate} className="w-full h-8 text-xs" size="sm" disabled={calGenerating}>
                  {calGenerating ? '生成中...' : '生成校准 LUT'}
                </Button>
                {calResult && (
                  <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3">
                    <p className="text-xs font-medium text-green-700 dark:text-green-400">✓ 校准 LUT 已生成</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{calResult}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">校准参数摘要</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-xs py-2">目标色域</TableCell>
                      <TableCell className="text-xs py-2 font-mono">{calTargetGamut}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs py-2">目标传输函数</TableCell>
                      <TableCell className="text-xs py-2 font-mono">{calTargetTF}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs py-2">白点</TableCell>
                      <TableCell className="text-xs py-2 font-mono">{calWhitePoint}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs py-2">峰值亮度</TableCell>
                      <TableCell className="text-xs py-2 font-mono">{calLuminance} nits</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs py-2">网格大小</TableCell>
                      <TableCell className="text-xs py-2 font-mono">{calGridSize}³</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs py-2">源色域</TableCell>
                      <TableCell className="text-xs py-2 font-mono">sRGB</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs py-2">源传输函数</TableCell>
                      <TableCell className="text-xs py-2 font-mono">sRGB</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== TAB 5: 测量数据 ===== */}
        <TabsContent value="measurement" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">导入测量数据</CardTitle>
                <CardDescription>导入色块测量结果 (格式: 名称 x y L，每行一组)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder={`Red 0.6400 0.3300 21.5\nGreen 0.3000 0.6000 71.2\nBlue 0.1500 0.0600 7.2\nWhite 0.3127 0.3290 100.0`}
                  className="h-40 text-xs font-mono"
                  value={measureInput}
                  onChange={(e) => setMeasureInput(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button onClick={handleParseMeasure} className="flex-1 h-8 text-xs" size="sm">
                    解析数据
                  </Button>
                  <Button onClick={handleAddMeasurePoint} variant="outline" className="h-8 text-xs" size="sm">
                    添加数据点
                  </Button>
                  <Button onClick={() => setMeasureData([])} variant="outline" className="h-8 text-xs" size="sm">
                    清空
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">测量结果 ({measureData.length} 点)</CardTitle>
              </CardHeader>
              <CardContent>
                {measureData.length > 0 ? (
                  <div className="max-h-72 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7">名称</TableHead>
                          <TableHead className="text-[10px] h-7">x</TableHead>
                          <TableHead className="text-[10px] h-7">y</TableHead>
                          <TableHead className="text-[10px] h-7">L</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {measureData.map((d, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs py-1.5">{d.name}</TableCell>
                            <TableCell className="text-xs py-1.5 font-mono">{d.x.toFixed(4)}</TableCell>
                            <TableCell className="text-xs py-1.5 font-mono">{d.y.toFixed(4)}</TableCell>
                            <TableCell className="text-xs py-1.5 font-mono">{d.L.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                    暂无测量数据
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Measurement CIE chart */}
          {measureData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">测量数据分布 (CIE xy)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="x" type="number" domain={[0, 0.8]} tick={{ fontSize: 10 }} label={{ value: 'x', position: 'bottom', fontSize: 11 }} />
                      <YAxis dataKey="y" type="number" domain={[0, 0.9]} tick={{ fontSize: 10 }} label={{ value: 'y', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                      <Tooltip
                        content={({ payload }) => {
                          if (!payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-background border rounded-lg p-2 shadow-lg text-xs">
                              <p>{d.name}</p>
                              <p>x: {d.x} y: {d.y} L: {d.L}</p>
                            </div>
                          );
                        }}
                      />
                      <Scatter
                        data={measureData.map((d) => ({ x: d.x, y: d.y, name: d.name, L: d.L }))}
                        fill="#8b5cf6"
                      >
                        {measureData.map((d, i) => (
                          <Cell key={i} fill={`hsl(${(i * 360) / measureData.length}, 70%, 50%)`} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
