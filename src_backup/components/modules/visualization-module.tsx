'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Slider } from '@/components/ui/slider';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ScatterChart,
  Scatter,
  ReferenceLine,
  Cell,
  Area,
  AreaChart,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  BarChart,
  Bar,
} from 'recharts';
import {
  generateMultipleCurves,
  getTransferFunctionNames,
  type TransferFunctionName,
} from '@/lib/color-science/tf-gamma';
import {
  STANDARD_GAMUTS,
  getGamutNames,
} from '@/lib/color-science/gamuts';
import { getLUTSlice, createColorSpaceLUT, type LUT3D } from '@/lib/color-science/lut3d';
import { useAppStore, type PipelineNode } from '@/lib/store/app-store';
import {
  Workflow,
  GitBranch,
  Box,
  Settings,
  Monitor,
  Camera,
  Film,
  Printer,
  Sparkles,
  Save,
  Download,
  Upload,
  Trash2,
  Copy,
  Terminal,
  HelpCircle,
  Lightbulb,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Circle,
  Play,
  Clock,
  Layers,
  Eye,
  FileJson,
  Code2,
  Zap,
  BookOpen,
  Target,
  RotateCcw,
  RotateCw,
} from 'lucide-react';

// ============ Constants ============

const CURVE_COLORS = [
  '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

const ENV_PRESETS = [
  {
    id: 'web-dev',
    name: 'Web 开发',
    icon: Monitor,
    description: 'sRGB 色域 + sRGB 传输函数',
    gamut: 'sRGB',
    tf: 'sRGB' as TransferFunctionName,
    color: 'bg-blue-500/10 text-blue-600 border-blue-200',
  },
  {
    id: 'film-post',
    name: '影视后期',
    icon: Film,
    description: 'DCI-P3 色域 + Gamma 2.6',
    gamut: 'DCI_P3',
    tf: 'gamma26' as TransferFunctionName,
    color: 'bg-purple-500/10 text-purple-600 border-purple-200',
  },
  {
    id: 'hdr',
    name: 'HDR 制作',
    icon: Zap,
    description: 'Rec.2020 色域 + PQ/HLG',
    gamut: 'Rec2020',
    tf: 'st2084' as TransferFunctionName,
    color: 'bg-orange-500/10 text-orange-600 border-orange-200',
  },
  {
    id: 'print',
    name: '印刷输出',
    icon: Printer,
    description: 'ProPhoto 色域 + Gamma 1.8',
    gamut: 'ProPhoto',
    tf: 'gamma22' as TransferFunctionName,
    color: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
  },
  {
    id: 'photography',
    name: '摄影工作流',
    icon: Camera,
    description: 'AdobeRGB 色域 + Gamma 2.2',
    gamut: 'AdobeRGB',
    tf: 'gamma22' as TransferFunctionName,
    color: 'bg-rose-500/10 text-rose-600 border-rose-200',
  },
];

const AVAILABLE_MODULES = [
  { id: 'gamut-convert', name: '色域转换', description: 'RGB 色域之间的数学变换', enabled: true, category: '色彩基础' },
  { id: 'tf-apply', name: '传输函数', description: 'Gamma / PQ / HLG 编解码', enabled: true, category: '色彩基础' },
  { id: 'lut3d-apply', name: '3DLUT 应用', description: '三维查找表插值', enabled: true, category: 'LUT' },
  { id: 'lut3d-generate', name: 'LUT 生成', description: '从色彩空间变换生成 LUT', enabled: true, category: 'LUT' },
  { id: 'gamut-coverage', name: '色域覆盖率', description: '色域体积比较与覆盖分析', enabled: true, category: '校准' },
  { id: 'color-temp', name: '色温白点', description: '色温 ↔ CIE xy 转换', enabled: true, category: '校准' },
  { id: 'delta-e', name: '色差计算', description: 'ΔE2000 / ΔE76 / ΔE94', enabled: false, category: '度量' },
  { id: 'image-sim', name: '图像仿真', description: '图片色彩空间仿真预览', enabled: false, category: '仿真' },
  { id: 'batch-process', name: '批处理引擎', description: '批量图像色彩处理', enabled: false, category: '工程' },
  { id: 'icc-profile', name: 'ICC 解析', description: 'ICC Profile 读取与应用', enabled: false, category: '工程' },
];

const WIZARD_GUIDES = [
  {
    id: 'srgb-to-p3',
    title: '如何将 sRGB 转换为 DCI-P3',
    steps: [
      '在「色彩基础」模块中选择色域转换工具',
      '源色域设为 sRGB，目标色域设为 DCI-P3',
      '传输函数均选择 sRGB',
      '点击「转换」查看结果',
      '可生成 3DLUT 用于批量应用',
    ],
  },
  {
    id: 'calibration-lut',
    title: '如何创建校准 LUT',
    steps: [
      '在「色域/色彩校准」模块选择目标白点',
      '设定目标色域和传输函数',
      '配置 LUT 尺寸（推荐 33 或 65）',
      '点击「生成校准 LUT」',
      '导出为 .cube 格式应用到显示设备',
    ],
  },
  {
    id: 'color-accuracy',
    title: '如何测量色彩准确度',
    steps: [
      '使用色差计算工具 (ΔE)',
      '输入参考值和测量值',
      '选择色差公式 (ΔE2000 推荐)',
      '查看每个色块的偏差',
      '分析平均和最大 ΔE 值',
    ],
  },
];

// ============ Flow Visualization ============

function FlowVisualization() {
  const { pipelines, activePipelineId, getActivePipeline } = useAppStore();
  const activePipeline = getActivePipeline();

  const defaultNodes: PipelineNode[] = useMemo(() => {
    if (activePipeline && activePipeline.nodes.length > 0) return activePipeline.nodes;
    return [
      { id: 'input', type: 'input', name: '输入源', params: { format: 'sRGB' }, enabled: true, position: { x: 0, y: 0 } },
      { id: 'decode-tf', type: 'transform', name: '解码传输函数', params: { tf: 'sRGB' }, enabled: true, position: { x: 1, y: 0 } },
      { id: 'gamut-convert', type: 'transform', name: '色域转换', params: { src: 'sRGB', dst: 'DCI_P3' }, enabled: true, position: { x: 2, y: 0 } },
      { id: 'encode-tf', type: 'transform', name: '编码传输函数', params: { tf: 'gamma26' }, enabled: true, position: { x: 3, y: 0 } },
      { id: 'output', type: 'output', name: '输出', params: { format: 'DCI-P3' }, enabled: true, position: { x: 4, y: 0 } },
    ];
  }, [activePipeline]);

  const nodeTypeColors: Record<string, string> = {
    input: 'border-green-400 bg-green-50',
    output: 'border-amber-400 bg-amber-50',
    transform: 'border-blue-400 bg-blue-50',
    filter: 'border-purple-400 bg-purple-50',
    analysis: 'border-rose-400 bg-rose-50',
  };

  const nodeTypeLabels: Record<string, string> = {
    input: '输入',
    output: '输出',
    transform: '变换',
    filter: '滤镜',
    analysis: '分析',
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">通路流程图</CardTitle>
          <CardDescription>
            当前管线: {activePipeline ? activePipeline.name : '默认示例'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pipelines.length === 0 && (
            <Alert className="mb-4">
              <Info className="h-4 w-4" />
              <AlertTitle>暂无自定义管线</AlertTitle>
              <AlertDescription>
                下方展示的是默认示例流程。前往「通路/流程」模块创建自定义管线。
              </AlertDescription>
            </Alert>
          )}

          <ScrollArea className="w-full">
            <div className="flex items-center gap-3 min-w-max pb-2">
              {defaultNodes.map((node, idx) => (
                <React.Fragment key={node.id}>
                  <div
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 min-w-[120px] transition-all ${
                      nodeTypeColors[node.type] || 'border-gray-400 bg-gray-50'
                    } ${!node.enabled ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          node.enabled ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      />
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {nodeTypeLabels[node.type] || node.type}
                      </Badge>
                    </div>
                    <span className="text-sm font-medium text-center">{node.name}</span>
                    <div className="text-[10px] text-muted-foreground text-center max-w-[100px] truncate">
                      {Object.entries(node.params)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', ')}
                    </div>
                  </div>
                  {idx < defaultNodes.length - 1 && (
                    <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">节点统计</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">总节点数</span>
              <span className="font-medium">{defaultNodes.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">已启用</span>
              <span className="font-medium text-green-600">
                {defaultNodes.filter((n) => n.enabled).length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">已禁用</span>
              <span className="font-medium text-gray-500">
                {defaultNodes.filter((n) => !n.enabled).length}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">变换链</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">变换模块</span>
              <span className="font-medium">
                {defaultNodes.filter((n) => n.type === 'transform').length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">输入/输出</span>
              <span className="font-medium">
                {defaultNodes.filter((n) => n.type === 'input' || n.type === 'output').length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">处理阶段</span>
              <span className="font-medium">{defaultNodes.length - 2}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">管线状态</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">管线数量</span>
              <span className="font-medium">{pipelines.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">活跃管线</span>
              <span className="font-medium text-blue-600">
                {activePipeline ? activePipeline.name : '无'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">最后更新</span>
              <span className="font-medium">
                {activePipeline
                  ? new Date(activePipeline.updatedAt).toLocaleTimeString()
                  : '—'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============ Curve Visualization ============

function CurveVisualization() {
  const tfNames = getTransferFunctionNames().filter((n) => n !== 'custom');
  const [selectedTFs, setSelectedTFs] = useState<TransferFunctionName[]>(['sRGB', 'gamma22', 'bt1886']);
  const [customGamma, setCustomGamma] = useState(2.2);
  const [showCustom, setShowCustom] = useState(false);

  const toggleTF = useCallback((tf: TransferFunctionName) => {
    setSelectedTFs((prev) =>
      prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf]
    );
  }, []);

  const curveData = useMemo(() => {
    if (selectedTFs.length === 0) return [];
    const tfs = selectedTFs.map((tf) => ({
      name: tf,
      tf,
      gamma: tf === 'custom' ? customGamma : undefined,
    }));
    return generateMultipleCurves(tfs, 256);
  }, [selectedTFs, customGamma]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">传输函数曲线对比</CardTitle>
          <CardDescription>
            选择多个传输函数叠加显示 · X = 输入 (0–1) · Y = 输出 (0–1)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {tfNames.map((tf) => (
              <Badge
                key={tf}
                variant={selectedTFs.includes(tf) ? 'default' : 'outline'}
                className="cursor-pointer select-none transition-colors"
                onClick={() => toggleTF(tf)}
                style={
                  selectedTFs.includes(tf)
                    ? { backgroundColor: CURVE_COLORS[tfNames.indexOf(tf) % CURVE_COLORS.length] }
                    : undefined
                }
              >
                {tf}
              </Badge>
            ))}
            <Badge
              variant={showCustom ? 'default' : 'outline'}
              className="cursor-pointer select-none transition-colors"
              onClick={() => {
                setShowCustom(!showCustom);
                if (!showCustom) {
                  setSelectedTFs((prev) => [...prev, 'custom']);
                } else {
                  setSelectedTFs((prev) => prev.filter((t) => t !== 'custom'));
                }
              }}
              style={showCustom ? { backgroundColor: '#888888' } : undefined}
            >
              自定义 Gamma
            </Badge>
          </div>

          {showCustom && (
            <div className="flex items-center gap-3">
              <Label className="text-sm whitespace-nowrap">Gamma 值:</Label>
              <Slider
                value={[customGamma]}
                onValueChange={([v]) => setCustomGamma(v)}
                min={0.5}
                max={4.0}
                step={0.1}
                className="w-48"
              />
              <span className="text-sm font-mono font-medium w-12">{customGamma.toFixed(1)}</span>
            </div>
          )}

          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curveData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="input"
                  type="number"
                  domain={[0, 1]}
                  tickFormatter={(v: number) => v.toFixed(1)}
                  label={{ value: '输入值 (Input)', position: 'insideBottom', offset: -5, fontSize: 12 }}
                />
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={(v: number) => v.toFixed(1)}
                  label={{ value: '输出值 (Output)', angle: -90, position: 'insideLeft', fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    value.toFixed(4),
                    name === 'custom' ? `Gamma ${customGamma}` : name,
                  ]}
                  labelFormatter={(label: number) => `Input: ${Number(label).toFixed(4)}`}
                />
                <Legend />
                <ReferenceLine
                  x={0}
                  y={0}
                  stroke="#666"
                  strokeDasharray="3 3"
                  strokeWidth={0.5}
                />
                <ReferenceLine
                  segment={[
                    { x: 0, y: 0 },
                    { x: 1, y: 1 },
                  ]}
                  stroke="#999"
                  strokeDasharray="5 5"
                  strokeWidth={1}
                  label={{ value: '45° (Identity)', position: 'insideTopRight', fontSize: 10, fill: '#999' }}
                />
                {selectedTFs.map((tf, idx) => (
                  <Line
                    key={tf}
                    type="monotone"
                    dataKey={tf}
                    name={tf === 'custom' ? `Gamma ${customGamma}` : tf}
                    stroke={CURVE_COLORS[tfNames.indexOf(tf as TransferFunctionName) % CURVE_COLORS.length] || '#888'}
                    dot={false}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ 3DLUT Visualization ============

function LUTVisualization() {
  const [lutSize] = useState(17);
  const [selectedAxis, setSelectedAxis] = useState<0 | 1 | 2>(0);
  const [slicePos, setSlicePos] = useState(0);
  const [srcGamut, setSrcGamut] = useState('sRGB');
  const [dstGamut, setDstGamut] = useState('DCI_P3');
  const gamutNames = getGamutNames();

  const lut = useMemo<LUT3D>(() => {
    return createColorSpaceLUT(lutSize, srcGamut, 'sRGB', dstGamut, 'sRGB');
  }, [lutSize, srcGamut, dstGamut]);

  const sliceData = useMemo(() => {
    return getLUTSlice(lut, selectedAxis, slicePos);
  }, [lut, selectedAxis, slicePos]);

  const axisLabels = ['R (红)', 'G (绿)', 'B (蓝)'];

  const renderSliceGrid = () => {
    const size = lut.size;
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="text-xs text-muted-foreground">
          切片轴: {axisLabels[selectedAxis]} | 位置: {slicePos}/{size - 1}
        </div>
        <div
          className="grid border border-border rounded overflow-hidden"
          style={{
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gap: '0px',
          }}
        >
          {sliceData.flat().map((cell, i) => {
            const r = Math.round(Math.max(0, Math.min(1, cell.rgb[0])) * 255);
            const g = Math.round(Math.max(0, Math.min(1, cell.rgb[1])) * 255);
            const b = Math.round(Math.max(0, Math.min(1, cell.rgb[2])) * 255);
            const cellSize = Math.max(4, Math.min(28, Math.floor(480 / size)));
            return (
              <div
                key={i}
                title={`RGB(${r}, ${g}, ${b})`}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: `rgb(${r},${g},${b})`,
                  minWidth: cellSize,
                  minHeight: cellSize,
                }}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>
            横轴:{' '}
            {selectedAxis === 0 ? 'G →' : selectedAxis === 1 ? 'R →' : 'R →'}
          </span>
          <span>|</span>
          <span>
            纵轴:{' '}
            {selectedAxis === 0 ? 'B ↓' : selectedAxis === 1 ? 'B ↓' : 'G ↓'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">3DLUT 切片查看器</CardTitle>
          <CardDescription>
            选择色彩空间变换，查看 LUT 三维网格的二维切片
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">源色域</Label>
              <Select value={srcGamut} onValueChange={setSrcGamut}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gamutNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {STANDARD_GAMUTS[name]?.name || name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">目标色域</Label>
              <Select value={dstGamut} onValueChange={setDstGamut}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gamutNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {STANDARD_GAMUTS[name]?.name || name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">LUT 尺寸</Label>
              <div className="text-sm font-mono text-muted-foreground py-2">{lutSize}³ = {lutSize * lutSize * lutSize} 条目</div>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-sm font-medium">固定轴:</Label>
              {([0, 1, 2] as const).map((axis) => (
                <Button
                  key={axis}
                  size="sm"
                  variant={selectedAxis === axis ? 'default' : 'outline'}
                  onClick={() => setSelectedAxis(axis)}
                >
                  {axisLabels[axis]}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-sm whitespace-nowrap">切片位置:</Label>
              <Slider
                value={[slicePos]}
                onValueChange={([v]) => setSlicePos(v)}
                min={0}
                max={lut.size - 1}
                step={1}
                className="flex-1"
              />
              <span className="text-sm font-mono w-8 text-right">{slicePos}</span>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-muted/20">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary">{lut.name}</Badge>
              <span className="text-xs text-muted-foreground">{lut.size}×{lut.size}×{lut.size}</span>
            </div>
            {renderSliceGrid()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Parameter Config ============

function ParameterConfig() {
  const { pipelines, activePipelineId, getActivePipeline, updatePipeline, lockedParams, toggleParamLock, isParamLocked } = useAppStore();
  const [editingParam, setEditingParam] = useState<{ node: string; key: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const activePipeline = getActivePipeline();

  const allParams = useMemo(() => {
    if (!activePipeline) {
      return [
        { module: '示例管线', param: '源色域', value: 'sRGB', key: 'example-src' },
        { module: '示例管线', param: '目标色域', value: 'DCI-P3', key: 'example-dst' },
        { module: '示例管线', param: '传输函数', value: 'sRGB', key: 'example-tf' },
        { module: '示例管线', param: 'LUT 尺寸', value: '33', key: 'example-lutsize' },
        { module: '示例管线', param: '白点', value: 'D65', key: 'example-wp' },
        { module: '示例管线', param: '峰值亮度', value: '1000 nits', key: 'example-peak' },
      ];
    }
    const params: { module: string; param: string; value: string; key: string }[] = [];
    activePipeline.nodes.forEach((node) => {
      Object.entries(node.params).forEach(([key, val]) => {
        params.push({
          module: node.name,
          param: key,
          value: String(val),
          key: `${node.id}-${key}`,
        });
      });
    });
    return params;
  }, [activePipeline]);

  const handleSaveEdit = () => {
    if (!editingParam) return;
    setEditingParam(null);
    setEditValue('');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">参数配置表</CardTitle>
          <CardDescription>
            查看和编辑管线中所有模块的参数 · 点击 🔒 锁定参数防止意外修改
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1">
              {allParams.map((p, idx) => (
                <div
                  key={p.key}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => toggleParamLock(p.key)}
                  >
                    {isParamLocked(p.key) ? (
                      <span className="text-xs">🔒</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">🔓</span>
                    )}
                  </Button>
                  <span className="text-sm text-muted-foreground w-24 truncate">{p.module}</span>
                  <Separator orientation="vertical" className="h-4" />
                  <span className="text-sm font-medium w-24 truncate">{p.param}</span>
                  <Separator orientation="vertical" className="h-4" />
                  <span className="text-sm text-muted-foreground flex-1 font-mono">{p.value}</span>
                  <Dialog
                    open={editingParam?.key === p.key}
                    onOpenChange={(open) => {
                      if (open) {
                        setEditingParam({ node: p.module, key: p.param });
                        setEditValue(p.value);
                      } else {
                        setEditingParam(null);
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 text-xs">
                        编辑
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-sm">
                      <DialogHeader>
                        <DialogTitle>编辑参数</DialogTitle>
                        <DialogDescription>
                          {p.module} / {p.param}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label>参数值</Label>
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingParam(null)}>
                          取消
                        </Button>
                        <Button onClick={handleSaveEdit}>保存</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Project Config ============

function ProjectConfig() {
  const { projects, pipelines, createProject, updateProject } = useAppStore();
  const [projectName, setProjectName] = useState('我的色彩项目');
  const [projectDesc, setProjectDesc] = useState('色彩处理管线配置项目');
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [exportJson, setExportJson] = useState('');
  const [showJson, setShowJson] = useState(false);

  const configJson = useMemo(() => {
    return JSON.stringify(
      {
        name: projectName,
        description: projectDesc,
        pipeline: selectedPipelineId || pipelines[0]?.id || null,
        pipelines: pipelines.map((p) => ({
          id: p.id,
          name: p.name,
          nodes: p.nodes.length,
        })),
        settings: {
          lutSize: 33,
          interpolation: 'trilinear',
          colorDepth: '16-bit',
        },
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  }, [projectName, projectDesc, selectedPipelineId, pipelines]);

  const handleCopyJson = useCallback(() => {
    try { navigator.clipboard.writeText(configJson); } catch { /* clipboard unavailable */ }
    setExportJson(configJson);
    setShowJson(true);
  }, [configJson]);

  const handleSave = useCallback(() => {
    const id = createProject(projectName);
    updateProject(id, {
      settings: { description: projectDesc, pipelineId: selectedPipelineId },
    });
  }, [createProject, updateProject, projectName, projectDesc, selectedPipelineId]);

  const handleLoad = useCallback(() => {
    if (exportJson) {
      try {
        const parsed = JSON.parse(exportJson);
        if (parsed.name) setProjectName(parsed.name);
        if (parsed.description) setProjectDesc(parsed.description);
      } catch {
        // invalid JSON
      }
    }
  }, [exportJson]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">工程配置</CardTitle>
          <CardDescription>设置项目名称、描述和管线选择</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>项目名称</Label>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>项目描述</Label>
            <Textarea
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>关联管线</Label>
            <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
              <SelectTrigger>
                <SelectValue placeholder="选择管线..." />
              </SelectTrigger>
              <SelectContent>
                {pipelines.length === 0 && (
                  <SelectItem value="none" disabled>
                    暂无管线，请先创建
                  </SelectItem>
                )}
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-1.5" />
              保存配置
            </Button>
            <Button variant="outline" onClick={handleLoad} disabled={!exportJson}>
              <Upload className="h-4 w-4 mr-1.5" />
              导入配置
            </Button>
            <Button variant="outline" onClick={handleCopyJson}>
              <Copy className="h-4 w-4 mr-1.5" />
              导出 JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {showJson && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">配置 JSON</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowJson(false)}
                className="h-6 text-xs"
              >
                收起
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto max-h-[240px] overflow-y-auto">
              {configJson}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">设置摘要</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-lg font-bold">{pipelines.length}</div>
              <div className="text-xs text-muted-foreground">管线</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-lg font-bold">{projects.length}</div>
              <div className="text-xs text-muted-foreground">项目</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-lg font-bold">33</div>
              <div className="text-xs text-muted-foreground">LUT 尺寸</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-lg font-bold">16-bit</div>
              <div className="text-xs text-muted-foreground">色彩深度</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Module Extension ============

function ModuleExtension() {
  const [modules, setModules] = useState(AVAILABLE_MODULES);

  const toggleModule = useCallback((id: string) => {
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
    );
  }, []);

  const enabledCount = modules.filter((m) => m.enabled).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">模块扩展管理</CardTitle>
              <CardDescription>启用/禁用处理模块</CardDescription>
            </div>
            <Badge variant="secondary">{enabledCount}/{modules.length} 已启用</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {modules.map((mod) => (
              <div
                key={mod.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  mod.enabled ? 'border-border' : 'border-dashed border-muted-foreground/30 opacity-60'
                }`}
              >
                <Switch
                  checked={mod.enabled}
                  onCheckedChange={() => toggleModule(mod.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{mod.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {mod.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertTitle>自定义模块扩展</AlertTitle>
        <AlertDescription>
          未来版本将支持自定义处理模块的注册和加载。您可以通过编写插件来实现自定义色彩变换算法、
          特殊滤镜效果或与外部色彩管理系统的集成接口。
        </AlertDescription>
      </Alert>
    </div>
  );
}

// ============ Environment Presets ============

function EnvironmentPresets() {
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [customGamut, setCustomGamut] = useState('sRGB');
  const [customTF, setCustomTF] = useState<TransferFunctionName>('sRGB');
  const tfNames = getTransferFunctionNames().filter((n) => n !== 'custom');
  const gamutNames = getGamutNames();

  const applyPreset = useCallback((presetId: string) => {
    setAppliedPreset(presetId);
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">环境预设</CardTitle>
          <CardDescription>快速应用常用工作环境的色域和传输函数配置</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ENV_PRESETS.map((preset) => {
              const Icon = preset.icon;
              const isApplied = appliedPreset === preset.id;
              return (
                <Card
                  key={preset.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    isApplied ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => applyPreset(preset.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`rounded-lg p-2 ${preset.color}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{preset.name}</span>
                          {isApplied && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {preset.description}
                        </p>
                        <div className="flex gap-1.5 mt-2">
                          <Badge variant="outline" className="text-[10px]">
                            {preset.gamut}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {preset.tf}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">自定义预设</CardTitle>
          <CardDescription>创建自定义环境预设组合</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">预设名称</Label>
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="如: 我的自定义预设"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">色域</Label>
              <Select value={customGamut} onValueChange={setCustomGamut}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gamutNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {STANDARD_GAMUTS[name]?.name || name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">传输函数</Label>
              <Select value={customTF} onValueChange={(v) => setCustomTF(v as TransferFunctionName)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tfNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button disabled={!customName}>
            <Save className="h-4 w-4 mr-1.5" />
            保存预设
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Version Management ============

function VersionManagement() {
  const { projects, createProject, saveVersion, updateProject, deleteProject } = useAppStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [versionName, setVersionName] = useState('');
  const [versionDesc, setVersionDesc] = useState('');

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const handleCreateProject = useCallback(() => {
    const id = createProject('新项目');
    setSelectedProjectId(id);
  }, [createProject]);

  const handleSaveVersion = useCallback(() => {
    if (!selectedProjectId || !versionName) return;
    saveVersion(selectedProjectId, versionName, versionDesc);
    setVersionName('');
    setVersionDesc('');
  }, [selectedProjectId, versionName, versionDesc, saveVersion]);

  const handleRestoreVersion = useCallback(
    (projectId: string, versionData: string) => {
      try {
        const parsed = JSON.parse(versionData);
        if (parsed.settings) {
          updateProject(projectId, { settings: parsed.settings });
        }
      } catch {
        // invalid
      }
    },
    [updateProject]
  );

  const handleDeleteVersion = useCallback(
    (projectId: string, versionId: string) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;
      updateProject(projectId, {
        versions: project.versions.filter((v) => v.id !== versionId),
      });
    },
    [projects, updateProject]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">配置版本管理</CardTitle>
          <CardDescription>保存、加载和管理项目配置的不同版本</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-sm">选择项目</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择或创建项目..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-5">
              <Button variant="outline" onClick={handleCreateProject}>
                <Save className="h-4 w-4 mr-1.5" />
                新建项目
              </Button>
            </div>
          </div>

          {selectedProject && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-medium">保存新版本</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    value={versionName}
                    onChange={(e) => setVersionName(e.target.value)}
                    placeholder="版本名称"
                  />
                  <Input
                    value={versionDesc}
                    onChange={(e) => setVersionDesc(e.target.value)}
                    placeholder="版本描述 (可选)"
                  />
                </div>
                <Button onClick={handleSaveVersion} disabled={!versionName}>
                  <Save className="h-4 w-4 mr-1.5" />
                  保存版本
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selectedProject && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              版本历史 — {selectedProject.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedProject.versions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                暂无版本记录
              </p>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {selectedProject.versions
                    .slice()
                    .reverse()
                    .map((version) => (
                      <div
                        key={version.id}
                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                      >
                        <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{version.name}</div>
                          {version.description && (
                            <div className="text-xs text-muted-foreground">
                              {version.description}
                            </div>
                          )}
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(version.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              handleRestoreVersion(selectedProject.id, version.data)
                            }
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            恢复
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive"
                            onClick={() =>
                              handleDeleteVersion(selectedProject.id, version.id)
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============ Debug & Snapshots ============

function DebugSnapshots() {
  const { undoStack, redoStack, pushUndoState } = useAppStore();
  const [snapshots, setSnapshots] = useState<
    { id: string; timestamp: number; label: string; data: string }[]
  >([]);

  const takeSnapshot = useCallback(() => {
    const snapshot = {
      id: `snap_${Date.now()}`,
      timestamp: Date.now(),
      label: `快照 ${snapshots.length + 1}`,
      data: JSON.stringify({
        undoStackSize: undoStack.length,
        redoStackSize: redoStack.length,
        timestamp: new Date().toISOString(),
      }),
    };
    setSnapshots((prev) => [...prev, snapshot]);
  }, [snapshots.length, undoStack.length, redoStack.length]);

  const deleteSnapshot = useCallback((id: string) => {
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const getSnapshotDiff = useCallback(
    (snapA: string, snapB: string) => {
      try {
        const a = JSON.parse(snapA);
        const b = JSON.parse(snapB);
        const diffs: string[] = [];
        Object.keys({ ...a, ...b }).forEach((key) => {
          if (a[key] !== b[key]) {
            diffs.push(`${key}: ${a[key]} → ${b[key]}`);
          }
        });
        return diffs.length > 0 ? diffs : ['无差异'];
      } catch {
        return ['无法解析快照数据'];
      }
    },
    []
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">撤销/重做历史</CardTitle>
          <CardDescription>当前操作的撤销和重做栈状态</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                <span className="text-sm font-medium">撤销栈</span>
                <Badge variant="secondary">{undoStack.length}</Badge>
              </div>
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-1">
                  {undoStack.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">空</p>
                  ) : (
                    undoStack.map((entry, idx) => (
                      <div
                        key={idx}
                        className="text-xs text-muted-foreground p-1.5 rounded bg-muted/30 truncate"
                      >
                        #{idx + 1}: {entry.substring(0, 60)}...
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RotateCw className="h-4 w-4" />
                <span className="text-sm font-medium">重做栈</span>
                <Badge variant="secondary">{redoStack.length}</Badge>
              </div>
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-1">
                  {redoStack.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">空</p>
                  ) : (
                    redoStack.map((entry, idx) => (
                      <div
                        key={idx}
                        className="text-xs text-muted-foreground p-1.5 rounded bg-muted/30 truncate"
                      >
                        #{idx + 1}: {entry.substring(0, 60)}...
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">状态快照</CardTitle>
              <CardDescription>捕获当前状态的快照用于对比分析</CardDescription>
            </div>
            <Button size="sm" onClick={takeSnapshot}>
              <Camera className="h-4 w-4 mr-1.5" />
              拍摄快照
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              暂无快照，点击「拍摄快照」捕获当前状态
            </p>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {snapshots.map((snap, idx) => (
                  <div
                    key={snap.id}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{snap.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(snap.timestamp).toLocaleString()}
                      </div>
                      {idx > 0 && (
                        <div className="mt-1">
                          <p className="text-[10px] text-muted-foreground mb-0.5">
                            与上一快照的差异:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {getSnapshotDiff(
                              snapshots[idx - 1].data,
                              snap.data
                            ).map((diff, dIdx) => (
                              <Badge
                                key={dIdx}
                                variant="outline"
                                className="text-[10px]"
                              >
                                {diff}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      onClick={() => deleteSnapshot(snap.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Automation ============

function Automation() {
  const { pipelines, getActivePipeline } = useAppStore();
  const [copied, setCopied] = useState(false);

  const activePipeline = getActivePipeline();
  const pipelineName = activePipeline?.name || 'srgb-to-p3';

  const pipelineJson = useMemo(() => {
    return JSON.stringify(
      {
        version: '1.0',
        pipeline: {
          name: pipelineName,
          steps: [
            { type: 'decode_tf', params: { tf: 'sRGB' } },
            { type: 'gamut_convert', params: { src: 'sRGB', dst: 'DCI_P3' } },
            { type: 'encode_tf', params: { tf: 'gamma26' } },
          ],
        },
        options: {
          lut_size: 33,
          interpolation: 'trilinear',
          output_format: '16-bit TIFF',
        },
      },
      null,
      2
    );
  }, [pipelineName]);

  const cliExample = `colorpipeline --pipeline ${pipelineName} --input image.png --output result.png`;

  const apiEndpoint = `POST /api/pipeline/execute
Content-Type: application/json

${pipelineJson}`;

  const batchScript = [
    '#!/bin/bash',
    '# 批量色彩转换脚本',
    '# 由 ColorPipeline 自动生成',
    '',
    'INPUT_DIR="./input"',
    'OUTPUT_DIR="./output"',
    `PIPELINE="${pipelineName}"`,
    '',
    'mkdir -p "$OUTPUT_DIR"',
    '',
    'for file in "$INPUT_DIR"/*.{png,jpg,tiff}; do',
    '  [ -f "$file" ] || continue',
    '  filename=$(basename "$file")',
    '  echo "Processing: $filename"',
    '  colorpipeline --pipeline "$PIPELINE" \\',
    '    --input "$file" \\',
    '    --output "$OUTPUT_DIR/output.png"',
    'done',
    '',
    'echo "Batch processing complete!"',
  ].join('\n');

  const handleCopy = useCallback(async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">管线 JSON 配置</CardTitle>
          <CardDescription>当前管线的 JSON 配置格式</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="bg-muted p-4 rounded-lg text-xs font-mono overflow-x-auto max-h-[300px] overflow-y-auto">
              {pipelineJson}
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2 h-7 text-xs"
              onClick={() => handleCopy(pipelineJson)}
            >
              <Copy className="h-3 w-3 mr-1" />
              {copied ? '已复制' : '复制'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">命令行用法</CardTitle>
            <CardDescription>CLI 工具调用示例</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="bg-muted p-3 rounded-lg">
                <code className="text-xs font-mono text-green-700 dark:text-green-400">
                  $ {cliExample}
                </code>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 h-6 text-[10px]"
                onClick={() => handleCopy(cliExample)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">API 接口</CardTitle>
            <CardDescription>REST API 调用格式</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <pre className="bg-muted p-3 rounded-lg text-[10px] font-mono overflow-x-auto max-h-[140px]">
                POST /api/pipeline/execute
                {'{\n  "pipeline": "'}
                {pipelineName}
                {'",\n  "input": "image.png"\n}'}
              </pre>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 h-6 text-[10px]"
                onClick={() => handleCopy(apiEndpoint)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">批量处理脚本</CardTitle>
              <CardDescription>自动生成的批量转换脚本</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(batchScript)}
            >
              <Code2 className="h-4 w-4 mr-1.5" />
              生成脚本
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-lg text-xs font-mono overflow-x-auto max-h-[300px] overflow-y-auto">
            {batchScript}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Interaction ============

function InteractionGuide() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">快速指南与教程</CardTitle>
          <CardDescription>常见任务的分步操作说明</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {WIZARD_GUIDES.map((guide) => (
              <AccordionItem key={guide.id} value={guide.id}>
                <AccordionTrigger className="text-sm">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    {guide.title}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ol className="space-y-2 ml-6">
                    {guide.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                          {idx + 1}
                        </span>
                        <span className="text-muted-foreground">{step}</span>
                      </li>
                    ))}
                  </ol>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">键盘快捷键</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/30">
              <span className="text-sm">撤销操作</span>
              <kbd className="px-2 py-0.5 rounded border bg-background text-xs font-mono">
                Ctrl + Z
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/30">
              <span className="text-sm">重做操作</span>
              <kbd className="px-2 py-0.5 rounded border bg-background text-xs font-mono">
                Ctrl + Shift + Z
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/30">
              <span className="text-sm">保存配置</span>
              <kbd className="px-2 py-0.5 rounded border bg-background text-xs font-mono">
                Ctrl + S
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/30">
              <span className="text-sm">导出 LUT</span>
              <kbd className="px-2 py-0.5 rounded border bg-background text-xs font-mono">
                Ctrl + E
              </kbd>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">实用技巧</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
              <Lightbulb className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">LUT 尺寸选择</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  17³ 适合实时预览，33³ 是精度和性能的良好平衡，65³ 适合最终输出。
                  每增大一档，文件大小约增加 8 倍。
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
              <Lightbulb className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">色域覆盖对比</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  使用色域覆盖率工具可以快速比较不同色域的大小关系。
                  sRGB 约覆盖 DCI-P3 的 72%，Rec.2020 的 36%。
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
              <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">HDR 工作流</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  HDR 内容使用 PQ (ST.2084) 传输函数，支持最高 10000 nits 亮度。
                  HLG 更适合广播场景，可在 SDR 和 HDR 显示器间自适应。
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Map sidebar sub-item IDs to (outerTab, innerTab)
const SUB_TO_TAB: Record<string, [string, string]> = {
  'flow-viz': ['visualization', 'flow'],
  'curve-viz': ['visualization', 'curve'],
  'lut-viz': ['visualization', 'lut-viz'],
  'param-config': ['configuration', 'param-config'],
  'project-config': ['configuration', 'project-config'],
  'plugin-ext': ['configuration', 'module-ext'],
  'env-preset': ['configuration', 'env-preset'],
  'version-mgmt': ['engineering', 'version-mgmt'],
  'debug-snap': ['engineering', 'debug-snap'],
  'automation': ['engineering', 'automation'],
  'interaction': ['engineering', 'interaction'],
};

// ============ Main Component ============

export default function VisualizationModule() {
  const { activeTab, setActiveTab } = useAppStore();

  // Derive outer and inner tab from store activeTab
  const derivedOuterTab = useMemo(() => {
    const mapping = SUB_TO_TAB[activeTab];
    return mapping ? mapping[0] : 'visualization';
  }, [activeTab]);

  const derivedVizSubTab = useMemo(() => {
    const mapping = SUB_TO_TAB[activeTab];
    return (mapping && mapping[0] === 'visualization') ? mapping[1] : 'flow';
  }, [activeTab]);

  const derivedConfigSubTab = useMemo(() => {
    const mapping = SUB_TO_TAB[activeTab];
    return (mapping && mapping[0] === 'configuration') ? mapping[1] : 'param-config';
  }, [activeTab]);

  const derivedEngSubTab = useMemo(() => {
    const mapping = SUB_TO_TAB[activeTab];
    return (mapping && mapping[0] === 'engineering') ? mapping[1] : 'version-mgmt';
  }, [activeTab]);

  // Local state for inner-tab switching (overridden by sidebar navigation)
  const [outerTab, setOuterTab] = useState(derivedOuterTab);
  const [vizSubTab, setVizSubTab] = useState(derivedVizSubTab);
  const [configSubTab, setConfigSubTab] = useState(derivedConfigSubTab);
  const [engSubTab, setEngSubTab] = useState(derivedEngSubTab);

  // Use a key that changes when sidebar navigates, to reset local state
  const navKey = activeTab;
  const [localKey, setLocalKey] = useState(navKey);
  if (localKey !== navKey) {
    setLocalKey(navKey);
    setOuterTab(derivedOuterTab);
    setVizSubTab(derivedVizSubTab);
    setConfigSubTab(derivedConfigSubTab);
    setEngSubTab(derivedEngSubTab);
  }

  const handleOuterTabChange = (val: string) => {
    setOuterTab(val);
    const subMap: Record<string, string> = {
      'visualization': 'flow-viz',
      'configuration': 'param-config',
      'engineering': 'version-mgmt',
    };
    setActiveTab(subMap[val] || val);
  };

  return (
    <div className="p-4 md:p-6 space-y-2">
      <Tabs value={outerTab} onValueChange={handleOuterTabChange} className="w-full">
        {/* Main Tab Navigation */}
        <TabsList className="w-full h-auto flex flex-wrap">
          <TabsTrigger value="visualization" className="flex-1 min-w-[120px]">
            <Eye className="h-4 w-4 mr-1.5" />
            可视化
          </TabsTrigger>
          <TabsTrigger value="configuration" className="flex-1 min-w-[120px]">
            <Settings className="h-4 w-4 mr-1.5" />
            配置
          </TabsTrigger>
          <TabsTrigger value="engineering" className="flex-1 min-w-[120px]">
            <Terminal className="h-4 w-4 mr-1.5" />
            工程
          </TabsTrigger>
        </TabsList>

        {/* ===== VISUALIZATION TAB ===== */}
        <TabsContent value="visualization">
          <Tabs value={vizSubTab} onValueChange={setVizSubTab} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="flow" className="text-xs">
                <Workflow className="h-3.5 w-3.5 mr-1" />
                流程可视化
              </TabsTrigger>
              <TabsTrigger value="curve" className="text-xs">
                <GitBranch className="h-3.5 w-3.5 mr-1" />
                曲线可视化
              </TabsTrigger>
              <TabsTrigger value="lut-viz" className="text-xs">
                <Box className="h-3.5 w-3.5 mr-1" />
                3DLUT 可视化
              </TabsTrigger>
            </TabsList>

            <TabsContent value="flow">
              <FlowVisualization />
            </TabsContent>
            <TabsContent value="curve">
              <CurveVisualization />
            </TabsContent>
            <TabsContent value="lut-viz">
              <LUTVisualization />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ===== CONFIGURATION TAB ===== */}
        <TabsContent value="configuration">
          <Tabs value={configSubTab} onValueChange={setConfigSubTab} className="w-full">
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="param-config" className="text-xs">
                <Layers className="h-3.5 w-3.5 mr-1" />
                参数配置
              </TabsTrigger>
              <TabsTrigger value="project-config" className="text-xs">
                <FileJson className="h-3.5 w-3.5 mr-1" />
                工程配置
              </TabsTrigger>
              <TabsTrigger value="module-ext" className="text-xs">
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                模块扩展
              </TabsTrigger>
              <TabsTrigger value="env-preset" className="text-xs">
                <Monitor className="h-3.5 w-3.5 mr-1" />
                环境预设
              </TabsTrigger>
            </TabsList>

            <TabsContent value="param-config">
              <ParameterConfig />
            </TabsContent>
            <TabsContent value="project-config">
              <ProjectConfig />
            </TabsContent>
            <TabsContent value="module-ext">
              <ModuleExtension />
            </TabsContent>
            <TabsContent value="env-preset">
              <EnvironmentPresets />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ===== ENGINEERING TAB ===== */}
        <TabsContent value="engineering">
          <Tabs value={engSubTab} onValueChange={setEngSubTab} className="w-full">
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="version-mgmt" className="text-xs">
                <GitBranch className="h-3.5 w-3.5 mr-1" />
                配置版本
              </TabsTrigger>
              <TabsTrigger value="debug-snap" className="text-xs">
                <Camera className="h-3.5 w-3.5 mr-1" />
                调试与快照
              </TabsTrigger>
              <TabsTrigger value="automation" className="text-xs">
                <Code2 className="h-3.5 w-3.5 mr-1" />
                自动化接口
              </TabsTrigger>
              <TabsTrigger value="interaction" className="text-xs">
                <HelpCircle className="h-3.5 w-3.5 mr-1" />
                交互增强
              </TabsTrigger>
            </TabsList>

            <TabsContent value="version-mgmt">
              <VersionManagement />
            </TabsContent>
            <TabsContent value="debug-snap">
              <DebugSnapshots />
            </TabsContent>
            <TabsContent value="automation">
              <Automation />
            </TabsContent>
            <TabsContent value="interaction">
              <InteractionGuide />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Need a placeholder Info icon since we reference it but don't import it
function Info(props: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
      className={props.className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}
