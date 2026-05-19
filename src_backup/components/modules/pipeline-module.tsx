'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAppStore, BUILT_IN_PRESETS, type Pipeline, type PipelineNode, type PipelinePreset } from '@/lib/store/app-store';
import {
  convertColorSpace,
  rgbToLinear,
  linearToRgb,
  convertColorSpaceWithRange,
  fullToLimited,
  limitedToFull,
} from '@/lib/color-science/transform';
import type { VideoRange } from '@/lib/color-science/transform';
import { STANDARD_GAMUTS, getGamutNames } from '@/lib/color-science/gamuts';
import { getTransferFunctionNames, type TransferFunctionName, TRANSFER_FUNCTIONS } from '@/lib/color-science/tf-gamma';
import { type Vec3, type Mat3, mat3VecMultiply, mat3Invert, mat3Transpose, mat3Determinant } from '@/lib/color-science/matrices';
import { computeDeltaEFromRGB } from '@/lib/color-science/delta-e';
import { applyLUT3D, type LUT3D } from '@/lib/color-science/lut3d';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Trash2,
  Play,
  Upload,
  Download,
  GitBranch,
  Copy,
  Eye,
  ArrowRight,
  GripVertical,
  Layers,
  FileText,
  ImageIcon,
  CheckCircle2,
  Clock,
  X,
  Palette,
  ArrowRightLeft,
  SlidersHorizontal,
  Box,
  Sun,
  Zap,
  Grid3X3,
  Save,
  CircleDot,
  MousePointerClick,
  PanelLeftClose,
} from 'lucide-react';

// ============ Types ============

interface SimulationStep {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  inputRgb: Vec3;
  outputRgb: Vec3;
  params: Record<string, unknown>;
  processingTime: number;
  deltaE?: number;
  error?: boolean;
}

interface CsvRow {
  r: string;
  g: string;
  b: string;
}

interface CsvBatchResult {
  original: CsvRow;
  output: Vec3;
  error?: boolean;
}

// ============ Node Type Definitions ============

const NODE_TYPES = [
  { type: 'gamut-convert', label: '色域转换', icon: Palette, color: 'text-violet-600 bg-violet-100', desc: '源→目标色域' },
  { type: 'transfer-function', label: '传输函数', icon: ArrowRightLeft, color: 'text-blue-600 bg-blue-100', desc: '编码/解码 TF' },
  { type: 'gamma', label: 'Gamma', icon: SlidersHorizontal, color: 'text-amber-600 bg-amber-100', desc: 'Gamma 调整' },
  { type: 'lut-apply', label: '3DLUT 应用', icon: Box, color: 'text-emerald-600 bg-emerald-100', desc: '应用 3D LUT' },
  { type: 'tone-mapping', label: '色调映射', icon: Sun, color: 'text-orange-600 bg-orange-100', desc: 'HDR 色调映射' },
  { type: 'matrix-multiply', label: '矩阵运算', icon: Grid3X3, color: 'text-teal-600 bg-teal-100', desc: '自定义矩阵相乘' },
  { type: 'range-convert', label: '范围转换', icon: ArrowRight, color: 'text-rose-600 bg-rose-100', desc: 'Full/Limited Range' },
] as const;

const TONE_MAPPING_MODES = ['reinhard', 'filmic', 'aces'];

// ============ Utility Functions ============

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function rgbToHex(r: number, g: number, b: number): string {
  const cr = Math.round(clamp(r, 0, 1) * 255);
  const cg = Math.round(clamp(g, 0, 1) * 255);
  const cb = Math.round(clamp(b, 0, 1) * 255);
  return `#${cr.toString(16).padStart(2, '0')}${cg.toString(16).padStart(2, '0')}${cb.toString(16).padStart(2, '0')}`;
}

function rgbToDisplay(r: number, g: number, b: number): string {
  return `RGB(${clamp(r, 0, 1).toFixed(3)}, ${clamp(g, 0, 1).toFixed(3)}, ${clamp(b, 0, 1).toFixed(3)})`;
}

function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function getNodeSummary(node: PipelineNode): string {
  switch (node.type) {
    case 'gamut-convert':
      return `${node.params.srcGamut || '?'} → ${node.params.dstGamut || '?'}`;
    case 'transfer-function':
      return `${node.params.from || '?'} → ${node.params.to || '?'}`;
    case 'gamma':
      return `γ = ${node.params.gamma || '?'}`;
    case 'lut-apply':
      return `LUT: ${node.params.lutId || '?'}`;
    case 'tone-mapping':
      return `${node.params.mode || '?'}`;
    case 'matrix-multiply':
      return '3×3 矩阵';
    case 'range-convert': {
      const src = node.params.srcRange === 'limited' ? 'Limited' : 'Full';
      const dst = node.params.dstRange === 'limited' ? 'Limited' : 'Full';
      return `${src} → ${dst}`;
    }
    default:
      return node.type;
  }
}

function getNodeLabel(type: string): string {
  return NODE_TYPES.find((n) => n.type === type)?.label || type;
}

function getNodeIconClass(type: string) {
  return NODE_TYPES.find((n) => n.type === type) || NODE_TYPES[0];
}

function getNodeIcon(type: string, className = 'h-4 w-4') {
  const info = NODE_TYPES.find((n) => n.type === type);
  if (!info) return <Layers className={className} />;
  const Icon = info.icon;
  return <Icon className={className} />;
}

function applyNode(node: PipelineNode, input: Vec3): Vec3 {
  if (!node.enabled) return input;
  switch (node.type) {
    case 'gamut-convert': {
      const { srcGamut, dstGamut, srcTF, dstTF } = node.params as {
        srcGamut: string; dstGamut: string; srcTF: TransferFunctionName; dstTF: TransferFunctionName;
      };
      return convertColorSpace(input[0], input[1], input[2], srcGamut, srcTF, dstGamut, dstTF);
    }
    case 'transfer-function': {
      const { from, to } = node.params as { from: TransferFunctionName; to: TransferFunctionName };
      const [lr, lg, lb] = rgbToLinear(input[0], input[1], input[2], from);
      return linearToRgb(lr, lg, lb, to);
    }
    case 'gamma': {
      const { gamma, srcGamma } = node.params as { gamma: number; srcGamma: number };
      const srcG = srcGamma ?? 2.2;
      const [lr, lg, lb] = rgbToLinear(input[0], input[1], input[2], 'gamma22', srcG);
      return linearToRgb(lr, lg, lb, 'custom', gamma ?? 2.2);
    }
    case 'lut-apply': {
      const { lutId } = node.params as { lutId: string };
      const { lutLibrary } = useAppStore.getState();
      const lutEntry = lutId ? lutLibrary.get(lutId) : undefined;
      if (!lutEntry) return input;
      const lut3d: LUT3D = {
        name: lutEntry.name,
        size: lutEntry.size,
        data: lutEntry.data,
        inputRange: { min: 0, max: 1 },
        outputRange: { min: 0, max: 1 },
        srcGamut: lutEntry.srcGamut,
        dstGamut: lutEntry.dstGamut,
      };
      return applyLUT3D(lut3d, input[0], input[1], input[2]);
    }
    case 'matrix-multiply': {
      const { matrix } = node.params as { matrix: number[][] };
      if (!matrix || matrix.length !== 3) return input;
      const m: Mat3 = matrix as unknown as Mat3;
      return mat3VecMultiply(m, input);
    }
    case 'range-convert': {
      const { srcRange, dstRange } = node.params as { srcRange: VideoRange; dstRange: VideoRange };
      return convertColorSpaceWithRange(
        input[0], input[1], input[2],
        node.params.srcGamut as string || 'sRGB',
        node.params.srcTF as TransferFunctionName || 'bt709',
        srcRange || 'limited',
        node.params.dstGamut as string || 'sRGB',
        node.params.dstTF as TransferFunctionName || 'sRGB',
        dstRange || 'full'
      );
    }
    case 'tone-mapping': {
      const { mode } = node.params as { mode: string };
      let [r, g, b] = input;
      switch (mode) {
        case 'reinhard':
          r = r / (1 + r); g = g / (1 + g); b = b / (1 + b);
          break;
        case 'filmic':
          r = r * (2.51 * r + 0.03) / (r * (2.43 * r + 0.59) + 0.14);
          g = g * (2.51 * g + 0.03) / (g * (2.43 * g + 0.59) + 0.14);
          b = b * (2.51 * b + 0.03) / (b * (2.43 * b + 0.59) + 0.14);
          break;
        case 'aces':
          r = (r * (2.51 * r + 0.03)) / (r * (2.43 * r + 0.59) + 0.14);
          g = (g * (2.51 * g + 0.03)) / (g * (2.43 * g + 0.59) + 0.14);
          b = (b * (2.51 * b + 0.03)) / (b * (2.43 * b + 0.59) + 0.14);
          break;
        default: break;
      }
      return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)];
    }
    default:
      return input;
  }
}

function createDefaultNode(type: string): PipelineNode {
  const base = {
    id: generateNodeId(), type, enabled: true, position: { x: 0, y: 0 },
  };
  switch (type) {
    case 'gamut-convert':
      return { ...base, name: '色域转换', params: { srcGamut: 'sRGB', dstGamut: 'DCI_P3', srcTF: 'sRGB', dstTF: 'sRGB' } };
    case 'transfer-function':
      return { ...base, name: '传输函数', params: { from: 'sRGB' as TransferFunctionName, to: 'linear' as TransferFunctionName } };
    case 'gamma':
      return { ...base, name: 'Gamma', params: { gamma: 2.2, srcGamma: 1.0 } };
    case 'lut-apply':
      return { ...base, name: '3DLUT 应用', params: { lutId: '' } };
    case 'tone-mapping':
      return { ...base, name: '色调映射', params: { mode: 'reinhard' } };
    case 'matrix-multiply':
      return { ...base, name: '矩阵运算', params: { matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] } };
    case 'range-convert':
      return { ...base, name: '范围转换', params: { srcGamut: 'Rec709', srcTF: 'bt709' as TransferFunctionName, srcRange: 'limited' as VideoRange, dstGamut: 'sRGB', dstTF: 'sRGB' as TransferFunctionName, dstRange: 'full' as VideoRange } };
    default:
      return { ...base, name: type, params: {} };
  }
}

// ============ ColorSwatch Component ============

function ColorSwatch({ r, g, b, size = 'md', label }: { r: number; g: number; b: number; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const sizeClasses = { sm: 'h-6 w-6', md: 'h-10 w-10', lg: 'h-16 w-16' };
  const dr = clamp(r, 0, 1); const dg = clamp(g, 0, 1); const db = clamp(b, 0, 1);
  const border = (dr + dg + db) / 3 > 0.95 ? 'border border-border' : '';
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`${sizeClasses[size]} rounded-md shadow-sm ${border}`}
        style={{ backgroundColor: `rgb(${Math.round(dr * 255)}, ${Math.round(dg * 255)}, ${Math.round(db * 255)})` }}
      />
      {label && <span className="text-[10px] text-muted-foreground text-center max-w-24 truncate">{label}</span>}
    </div>
  );
}

// ============ Sortable Flow Node ============

function SortableFlowNode({
  node,
  index,
  isSelected,
  onSelect,
  onToggle,
  onDelete,
  onDuplicate,
}: {
  node: PipelineNode;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: node.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.7 : 1,
  };
  const info = getNodeIconClass(node.type);
  const IconComp = info.icon;

  return (
    <div ref={setNodeRef} style={style} className="shrink-0 flex items-center">
      <Card
        className={`
          relative w-52 transition-all cursor-pointer group
          ${isSelected ? 'ring-2 ring-primary shadow-lg border-primary/30' : 'hover:shadow-md hover:border-primary/20'}
          ${!node.enabled ? 'opacity-60' : ''}
        `}
        onClick={onSelect}
      >
        {/* Drag handle */}
        <div
          className="absolute -left-1 top-1/2 -translate-y-1/2 w-4 h-8 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-l-md bg-muted/80 hover:bg-muted text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3" />
        </div>

        <CardContent className="p-3 pl-5">
          {/* Header */}
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`rounded-md p-1 ${info.color} shrink-0`}>
                <IconComp className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-medium truncate">{node.name}</span>
            </div>
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="p-1 rounded hover:bg-muted-foreground/10"
                onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                title="复制"
              >
                <Copy className="h-3 w-3 text-muted-foreground" />
              </button>
              <button
                className="p-1 rounded hover:bg-destructive/10"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                title="删除"
              >
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          </div>

          {/* Summary */}
          <p className="text-[11px] text-muted-foreground truncate">{getNodeSummary(node)}</p>

          {/* Footer: enable toggle */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1.5">
              <Switch
                checked={node.enabled}
                onCheckedChange={() => onToggle()}
                className="scale-75"
              />
              <span className="text-[10px] text-muted-foreground">
                {node.enabled ? '已启用' : '已禁用'}
              </span>
            </div>
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">#{index + 1}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Plus Insert Button ============

function InsertButton({
  onInsert,
}: {
  onInsert: (type: string) => void;
}) {
  return (
    <div className="shrink-0 flex items-center">
      <Popover>
        <PopoverTrigger asChild>
          <button className="w-7 h-7 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary hover:bg-primary/5 hover:text-primary transition-all text-muted-foreground/50 hover:text-primary">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1.5" align="center">
          <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">插入节点</p>
          <div className="flex flex-col gap-0.5">
            {NODE_TYPES.map((nt) => {
              const Icon = nt.icon;
              return (
                <button
                  key={nt.type}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-sm transition-colors text-left"
                  onClick={() => onInsert(nt.type)}
                >
                  <div className={`rounded p-0.5 ${nt.color}`}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <span className="text-xs">{nt.label}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ============ Connection Line ============

function ConnectionLine() {
  return (
    <div className="shrink-0 flex items-center px-0.5">
      <div className="w-6 h-px bg-border relative">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[5px] border-l-muted-foreground/40 border-y-[3px] border-y-transparent" />
      </div>
    </div>
  );
}

// ============ Node Config Panel ============

function NodeConfigPanel({
  node,
  onUpdate,
  onClose,
}: {
  node: PipelineNode;
  onUpdate: (node: PipelineNode) => void;
  onClose: () => void;
}) {
  const { lutLibrary } = useAppStore();
  const [editNode, setEditNode] = useState<PipelineNode>({ ...node, params: { ...node.params } });
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const gamutNames = useMemo(() => getGamutNames(), []);
  const lutList = useMemo(() => Array.from(lutLibrary.entries()).map(([id, l]) => ({ id, name: l.name, size: l.size })), [lutLibrary]);
  const tfNames = useMemo(() => getTransferFunctionNames(), []);

  // Sync internal editNode when the selected node changes (id changes)
  const prevNodeIdRef = useRef(node.id);
  useEffect(() => {
    if (prevNodeIdRef.current !== node.id) {
      prevNodeIdRef.current = node.id;
      setEditNode({ ...node, params: { ...node.params } });
      setMatrixError(null);
    }
  }, [node.id, node.name, node.type, node.params]);

  const updateParam = (key: string, value: unknown) => {
    setEditNode((prev) => prev ? { ...prev, params: { ...prev.params, [key]: value } } : null);
  };

  const handleSave = () => {
    onUpdate(editNode);
    onClose();
  };

  const info = getNodeIconClass(editNode.type);
  const IconComp = info.icon;

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`rounded-md p-1 ${info.color}`}>
              <IconComp className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm">编辑节点</CardTitle>
              <CardDescription className="text-[11px]">{getNodeLabel(editNode.type)}</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">节点名称</Label>
            <Input
              value={editNode.name}
              onChange={(e) => setEditNode((prev) => prev ? { ...prev, name: e.target.value } : null)}
              className="h-8 text-sm"
            />
          </div>

          {editNode.type === 'gamut-convert' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">源色域</Label>
                <Select value={editNode.params.srcGamut as string} onValueChange={(v) => updateParam('srcGamut', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {gamutNames.map((g) => (
                      <SelectItem key={g} value={g} className="text-xs">{STANDARD_GAMUTS[g]?.name || g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">目标色域</Label>
                <Select value={editNode.params.dstGamut as string} onValueChange={(v) => updateParam('dstGamut', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {gamutNames.map((g) => (
                      <SelectItem key={g} value={g} className="text-xs">{STANDARD_GAMUTS[g]?.name || g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">源传输函数</Label>
                <Select value={editNode.params.srcTF as string} onValueChange={(v) => updateParam('srcTF', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tfNames.map((tf) => (
                      <SelectItem key={tf} value={tf} className="text-xs">{tf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">目标传输函数</Label>
                <Select value={editNode.params.dstTF as string} onValueChange={(v) => updateParam('dstTF', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tfNames.map((tf) => (
                      <SelectItem key={tf} value={tf} className="text-xs">{tf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {editNode.type === 'transfer-function' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">源传输函数</Label>
                <Select value={editNode.params.from as string} onValueChange={(v) => updateParam('from', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tfNames.map((tf) => (
                      <SelectItem key={tf} value={tf} className="text-xs">{tf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">目标传输函数</Label>
                <Select value={editNode.params.to as string} onValueChange={(v) => updateParam('to', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tfNames.map((tf) => (
                      <SelectItem key={tf} value={tf} className="text-xs">{tf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {editNode.type === 'gamma' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">源 Gamma</Label>
                <Input type="number" step="0.1" min="0.1" max="5" value={editNode.params.srcGamma as number}
                  onChange={(e) => updateParam('srcGamma', parseFloat(e.target.value) || 2.2)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">目标 Gamma</Label>
                <Input type="number" step="0.1" min="0.1" max="5" value={editNode.params.gamma as number}
                  onChange={(e) => updateParam('gamma', parseFloat(e.target.value) || 2.2)} className="h-8 text-sm" />
              </div>
            </div>
          )}

          {editNode.type === 'tone-mapping' && (
            <div className="space-y-1.5">
              <Label className="text-xs">映射模式</Label>
              <Select value={editNode.params.mode as string} onValueChange={(v) => updateParam('mode', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TONE_MAPPING_MODES.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {editNode.type === 'matrix-multiply' && (() => {
            const currentMatrix = (editNode.params.matrix as number[][]) || [[1,0,0],[0,1,0],[0,0,1]];
            const rowLabels = ['R\'', 'G\'', 'B\''];
            const colLabels = ['R', 'G', 'B'];
            const rowColors = [
              'border-l-rose-400 bg-rose-50/50 focus-within:bg-rose-100/60',
              'border-l-emerald-400 bg-emerald-50/50 focus-within:bg-emerald-100/60',
              'border-l-blue-400 bg-blue-50/50 focus-within:bg-blue-100/60',
            ];
            const rowTextColors = ['text-rose-700', 'text-emerald-700', 'text-blue-700'];
            const isIdentity = currentMatrix.every((row, i) => row.every((v, j) => i === j ? Math.abs(v - 1) < 0.0001 : Math.abs(v) < 0.0001));
            const det = mat3Determinant(currentMatrix as unknown as Mat3);
            const detIsZero = Math.abs(det) < 0.0001;

            const handleInvert = () => {
              try {
                const m = currentMatrix as unknown as Mat3;
                const inv = mat3Invert(m);
                setMatrixError(null);
                setEditNode({ ...editNode, params: { ...editNode.params, matrix: inv as unknown as number[][] } });
              } catch {
                setMatrixError('矩阵奇异，无法求逆');
                setTimeout(() => setMatrixError(null), 2500);
              }
            };

            const handleCopyMatrix = () => {
              const text = currentMatrix.map(r => r.map(v => v.toFixed(6)).join(', ')).join('\n');
              navigator.clipboard.writeText(text).then(() => {
                setMatrixError('已复制到剪贴板');
                setTimeout(() => setMatrixError(null), 1500);
              });
            };

            return (
              <div className="space-y-3">
                {/* Matrix description + real-time info */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium">3×3 色彩矩阵</Label>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      输入 [R, G, B] 向量与矩阵相乘，输出变换后的 [R&apos;, G&apos;, B&apos;]
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <Badge variant={isIdentity ? 'secondary' : 'outline'} className="text-[9px] h-5 px-1.5 font-normal">
                      {isIdentity ? '单位矩阵' : '自定义'}
                    </Badge>
                    <Badge variant={detIsZero ? 'destructive' : 'outline'} className="text-[9px] h-5 px-1.5 font-mono">
                      det = {det.toFixed(4)}
                    </Badge>
                  </div>
                </div>

                {/* Matrix visual with brackets and color-coded rows */}
                <div className="flex items-center gap-1.5">
                  {/* Output row labels */}
                  <div className="flex flex-col gap-1 pt-3">
                    {rowLabels.map((lbl, i) => (
                      <div key={i} className="h-8 flex items-center justify-center w-5">
                        <span className={`text-[10px] font-bold ${rowTextColors[i]}`}>{lbl}</span>
                      </div>
                    ))}
                  </div>

                  {/* Left bracket */}
                  <div className="flex flex-col items-center self-stretch py-1.5">
                    <div className="w-1.5 h-1.5 rounded-tl-sm border-l border-t border-muted-foreground/40" />
                    <div className="flex-1 w-px bg-muted-foreground/40" />
                    <div className="w-1.5 h-1.5 rounded-bl-sm border-l border-b border-muted-foreground/40" />
                  </div>

                  {/* Matrix cells */}
                  <div className="rounded-md border border-border/60 overflow-hidden">
                    {currentMatrix.map((row, i) => (
                      <div key={i} className={`flex border-l-[3px] ${rowColors[i]} ${i > 0 ? 'border-t border-border/40' : ''}`}>
                        {row.map((val, j) => {
                          const isDiagonal = i === j;
                          const isZero = Math.abs(val) < 0.0001 && !isDiagonal;
                          return (
                            <Input
                              key={`${i}-${j}`}
                              type="number"
                              step="0.001"
                              value={parseFloat(val.toFixed(6))}
                              onChange={(e) => {
                                const newMatrix = currentMatrix.map(r => [...r]);
                                newMatrix[i][j] = parseFloat(e.target.value) || 0;
                                setEditNode({ ...editNode, params: { ...editNode.params, matrix: newMatrix } });
                              }}
                              className={`h-8 w-[78px] text-[11px] text-center font-mono tabular-nums rounded-none border-0 border-r border-border/30 focus:ring-0 focus:z-10 ${
                                isDiagonal ? 'font-bold text-foreground' : ''
                              } ${isZero ? 'text-muted-foreground/50' : ''} ${val < 0 ? 'text-orange-600' : ''}`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Right bracket */}
                  <div className="flex flex-col items-center self-stretch py-1.5">
                    <div className="w-1.5 h-1.5 rounded-tr-sm border-r border-t border-muted-foreground/40" />
                    <div className="flex-1 w-px bg-muted-foreground/40" />
                    <div className="w-1.5 h-1.5 rounded-br-sm border-r border-b border-muted-foreground/40" />
                  </div>
                </div>

                {/* Column labels */}
                <div className="flex items-center justify-end gap-1.5">
                  <div className="flex items-center gap-1 ml-[calc(1.25rem+1.5rem+0.375rem)]">
                    {colLabels.map((lbl, j) => (
                      <span key={j} className="w-[78px] text-center text-[10px] font-medium text-muted-foreground/70">{lbl}</span>
                    ))}
                  </div>
                </div>

                {/* Matrix operations row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 gap-1"
                    onClick={handleInvert}
                    disabled={detIsZero}
                  >
                    <Zap className="h-3 w-3" /> 求逆
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 gap-1"
                    onClick={() => {
                      const m = currentMatrix as unknown as Mat3;
                      const t = mat3Transpose(m);
                      setEditNode({ ...editNode, params: { ...editNode.params, matrix: t as unknown as number[][] } });
                    }}
                  >
                    <Copy className="h-3 w-3" /> 转置
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 gap-1"
                    onClick={handleCopyMatrix}
                  >
                    <Save className="h-3 w-3" /> 复制
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 gap-1"
                    onClick={() => {
                      setEditNode({
                        ...editNode,
                        params: { ...editNode.params, matrix: [[1,0,0],[0,1,0],[0,0,1]] },
                      });
                    }}
                  >
                    <Grid3X3 className="h-3 w-3" /> 重置
                  </Button>
                </div>

                <Separator />

                {/* Preset matrix shortcuts - compact grid */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">预设模板</Label>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-md border hover:bg-accent transition-colors group"
                      onClick={() => {
                        setEditNode({ ...editNode, params: { ...editNode.params, matrix: [[0,1,0],[1,0,0],[0,0,1]] } });
                      }}
                    >
                      <span className="text-[11px] font-medium group-hover:text-primary transition-colors">R ↔ G</span>
                      <span className="text-[8px] text-muted-foreground">通道交换</span>
                    </button>
                    <button
                      className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-md border hover:bg-accent transition-colors group"
                      onClick={() => {
                        setEditNode({ ...editNode, params: { ...editNode.params, matrix: [[0,0,1],[0,1,0],[1,0,0]] } });
                      }}
                    >
                      <span className="text-[11px] font-medium group-hover:text-primary transition-colors">R ↔ B</span>
                      <span className="text-[8px] text-muted-foreground">通道交换</span>
                    </button>
                    <button
                      className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-md border hover:bg-accent transition-colors group"
                      onClick={() => {
                        setEditNode({ ...editNode, params: { ...editNode.params, matrix: [[0,1,0],[0,0,1],[1,0,0]] } });
                      }}
                    >
                      <span className="text-[11px] font-medium group-hover:text-primary transition-colors">RGB → GBR</span>
                      <span className="text-[8px] text-muted-foreground">循环移位</span>
                    </button>
                    <button
                      className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-md border hover:bg-accent transition-colors group"
                      onClick={() => {
                        const s = 0.5;
                        setEditNode({ ...editNode, params: { ...editNode.params, matrix: [[s,s,s],[s,s,s],[s,s,s]] } });
                      }}
                    >
                      <span className="text-[11px] font-medium group-hover:text-primary transition-colors">去饱和 50%</span>
                      <span className="text-[8px] text-muted-foreground">Desaturate</span>
                    </button>
                    <button
                      className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-md border hover:bg-accent transition-colors group"
                      onClick={() => {
                        const w = 0.299, u = 0.587, v = 0.114;
                        setEditNode({ ...editNode, params: { ...editNode.params, matrix: [[w,w,w],[w,w,w],[w,w,w]] } });
                      }}
                    >
                      <span className="text-[11px] font-medium group-hover:text-primary transition-colors">灰度化</span>
                      <span className="text-[8px] text-muted-foreground">Grayscale (BT.601)</span>
                    </button>
                    <button
                      className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-md border hover:bg-accent transition-colors group"
                      onClick={() => {
                        setEditNode({ ...editNode, params: { ...editNode.params, matrix: [[1.2,0,0],[0,1.2,0],[0,0,1.2]] } });
                      }}
                    >
                      <span className="text-[11px] font-medium group-hover:text-primary transition-colors">放大 1.2x</span>
                      <span className="text-[8px] text-muted-foreground">Brightness</span>
                    </button>
                  </div>
                </div>

                <Separator />

                {/* Matrix text area for copy/paste */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">矩阵数据</Label>
                    <span className="text-[9px] text-muted-foreground">可直接粘贴 3×3 数据</span>
                  </div>
                  <textarea
                    className="w-full rounded-md border bg-muted/30 px-2.5 py-2 text-[10px] font-mono leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    rows={3}
                    value={currentMatrix.map(r => r.map(v => v.toFixed(6).padStart(10)).join(', ')).join('\n')}
                    onChange={(e) => {
                      try {
                        const lines = e.target.value.trim().split('\n');
                        if (lines.length === 3) {
                          const parsed = lines.map(line => {
                            const nums = line.split(/[,\s]+/).filter(s => s.length > 0).map(Number);
                            if (nums.length !== 3 || nums.some(isNaN)) return null;
                            return nums.map(n => Math.round(n * 1000000) / 1000000);
                          });
                          if (parsed.every(Boolean)) {
                            setEditNode({ ...editNode, params: { ...editNode.params, matrix: parsed as number[][] } });
                          }
                        }
                      } catch { /* ignore parse errors */ }
                    }}
                  />
                </div>

                {/* Error/info toast */}
                {matrixError && (
                  <div className={`text-xs px-2.5 py-1.5 rounded-md text-center ${
                    matrixError.startsWith('矩阵奇异') ? 'bg-destructive/10 text-destructive' :
                    matrixError.startsWith('已复制') ? 'bg-emerald-50 text-emerald-700' :
                    'bg-muted text-foreground'
                  }`}>
                    {matrixError}
                  </div>
                )}
              </div>
            );
          })()}

          {editNode.type === 'range-convert' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">范围转换 / Range Conversion</Label>
                <p className="text-[10px] text-muted-foreground">
                  在 Full Range (0-255) 和 Limited Range (16-235) 之间转换
                </p>
              </div>

              {/* Source */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">源 (Source)</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">色域</span>
                    <Select value={editNode.params.srcGamut as string || 'Rec709'} onValueChange={(v) => updateParam('srcGamut', v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {getGamutNames().map((g) => (
                          <SelectItem key={g} value={g} className="text-xs">{STANDARD_GAMUTS[g].name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">传输函数</span>
                    <Select value={editNode.params.srcTF as string || 'bt709'} onValueChange={(v) => updateParam('srcTF', v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {getTransferFunctionNames().map((tf) => (
                          <SelectItem key={tf} value={tf} className="text-xs">{TRANSFER_FUNCTIONS[tf].name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant={(editNode.params.srcRange as string) === 'full' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 text-xs h-7"
                    onClick={() => updateParam('srcRange', 'full')}
                  >
                    Full Range
                  </Button>
                  <Button
                    variant={(editNode.params.srcRange as string) === 'limited' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 text-xs h-7"
                    onClick={() => updateParam('srcRange', 'limited')}
                  >
                    Limited Range
                  </Button>
                </div>
              </div>

              <div className="flex justify-center"><ArrowRight className="h-4 w-4 text-muted-foreground" /></div>

              {/* Target */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">目标 (Target)</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">色域</span>
                    <Select value={editNode.params.dstGamut as string || 'sRGB'} onValueChange={(v) => updateParam('dstGamut', v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {getGamutNames().map((g) => (
                          <SelectItem key={g} value={g} className="text-xs">{STANDARD_GAMUTS[g].name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">传输函数</span>
                    <Select value={editNode.params.dstTF as string || 'sRGB'} onValueChange={(v) => updateParam('dstTF', v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {getTransferFunctionNames().map((tf) => (
                          <SelectItem key={tf} value={tf} className="text-xs">{TRANSFER_FUNCTIONS[tf].name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant={(editNode.params.dstRange as string) === 'full' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 text-xs h-7"
                    onClick={() => updateParam('dstRange', 'full')}
                  >
                    Full Range
                  </Button>
                  <Button
                    variant={(editNode.params.dstRange as string) === 'limited' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 text-xs h-7"
                    onClick={() => updateParam('dstRange', 'limited')}
                  >
                    Limited Range
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="rounded-md bg-muted/40 px-2.5 py-2 text-[10px] text-muted-foreground space-y-0.5">
                <p>Limited Range: 16~235 (8-bit)，归一化 0.0627~0.9216</p>
                <p>Full Range: 0~255 (8-bit)，归一化 0~1</p>
                <p>公式: limited = full x (219/255) + (16/255)</p>
              </div>
            </div>
          )}

          {editNode.type === 'lut-apply' && (
            <div className="space-y-1.5">
              <Label className="text-xs">选择 LUT</Label>
              <Select
                value={editNode.params.lutId as string || ''}
                onValueChange={(v) => updateParam('lutId', v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={lutList.length === 0 ? '暂无可用 LUT' : '选择 LUT...'} />
                </SelectTrigger>
                <SelectContent>
                  {lutList.map((l) => (
                    <SelectItem key={l.id} value={l.id} className="text-xs">
                      {l.name} ({l.size}³)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {lutList.length === 0 && (
                <p className="text-[10px] text-muted-foreground">请先在 3DLUT 模块中创建或导入 LUT</p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>取消</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSave}>保存更改</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ TAB 1: Flow Management (Dify-like) ============

function FlowManageTab() {
  const {
    pipelines, activePipelineId, createPipeline, updatePipeline, deletePipeline, getActivePipeline,
  } = useAppStore();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pipelineNameInput, setPipelineNameInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showCreatePipeline, setShowCreatePipeline] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);

  const activePipeline = getActivePipeline();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const selectedNode = activePipeline?.nodes.find((n) => n.id === selectedNodeId) || null;

  const handleCreatePipeline = useCallback(() => {
    const name = pipelineNameInput.trim() || `流程 ${pipelines.length + 1}`;
    createPipeline(name);
    setPipelineNameInput('');
    setShowCreatePipeline(false);
  }, [createPipeline, pipelineNameInput, pipelines.length]);

  const handleAddNode = useCallback((type: string, insertIndex?: number) => {
    if (!activePipelineId) return;
    const pipeline = getActivePipeline();
    if (!pipeline) return;
    const newNode = createDefaultNode(type);
    const nodes = [...pipeline.nodes];
    if (insertIndex !== undefined) {
      nodes.splice(insertIndex, 0, newNode);
    } else {
      nodes.push(newNode);
    }
    updatePipeline(activePipelineId, { nodes });
    setSelectedNodeId(newNode.id);
  }, [activePipelineId, getActivePipeline, updatePipeline]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    if (!activePipelineId) return;
    const pipeline = getActivePipeline();
    if (!pipeline) return;
    const updatedNodes = pipeline.nodes.filter((n) => n.id !== nodeId);
    updatePipeline(activePipelineId, { nodes: updatedNodes });
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [activePipelineId, getActivePipeline, updatePipeline, selectedNodeId]);

  const handleToggleNode = useCallback((nodeId: string) => {
    if (!activePipelineId) return;
    const pipeline = getActivePipeline();
    if (!pipeline) return;
    const updatedNodes = pipeline.nodes.map((n) => n.id === nodeId ? { ...n, enabled: !n.enabled } : n);
    updatePipeline(activePipelineId, { nodes: updatedNodes });
  }, [activePipelineId, getActivePipeline, updatePipeline]);

  const handleDuplicateNode = useCallback((node: PipelineNode) => {
    if (!activePipelineId) return;
    const pipeline = getActivePipeline();
    if (!pipeline) return;
    const newNode: PipelineNode = { ...node, id: generateNodeId(), name: `${node.name} (副本)`, params: { ...node.params } };
    const idx = pipeline.nodes.findIndex((n) => n.id === node.id);
    const nodes = [...pipeline.nodes];
    nodes.splice(idx + 1, 0, newNode);
    updatePipeline(activePipelineId, { nodes });
  }, [activePipelineId, getActivePipeline, updatePipeline]);

  const handleUpdateNode = useCallback((updatedNode: PipelineNode) => {
    if (!activePipelineId) return;
    const pipeline = getActivePipeline();
    if (!pipeline) return;
    const updatedNodes = pipeline.nodes.map((n) => n.id === updatedNode.id ? updatedNode : n);
    updatePipeline(activePipelineId, { nodes: updatedNodes });
  }, [activePipelineId, getActivePipeline, updatePipeline]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activePipelineId) return;
    const pipeline = getActivePipeline();
    if (!pipeline) return;
    const oldIdx = pipeline.nodes.findIndex((n) => n.id === active.id);
    const newIdx = pipeline.nodes.findIndex((n) => n.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const newNodes = arrayMove(pipeline.nodes, oldIdx, newIdx);
    updatePipeline(activePipelineId, { nodes: newNodes });
  }, [activePipelineId, getActivePipeline, updatePipeline]);

  // Auto-scroll flow to the end when adding nodes
  useEffect(() => {
    if (flowRef.current) {
      flowRef.current.scrollLeft = flowRef.current.scrollWidth;
    }
  }, [activePipeline?.nodes.length]);

  return (
    <div className="flex h-full min-h-0">
      {/* Left sidebar: Node types */}
      {sidebarOpen && (
        <div className="w-48 shrink-0 border-r bg-muted/20 flex flex-col min-h-0">
          {/* Pipeline selector */}
          <div className="p-3 border-b shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">流程列表</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSidebarOpen(false)} title="收起侧栏">
                <PanelLeftClose className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Scrollable pipeline list */}
          <div className="flex-1 overflow-y-auto min-h-0 p-3 pt-2">
            {pipelines.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-2">暂无流程</p>
            )}
            {pipelines.map((p) => (
              <div
                key={p.id}
                className={`group w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded-md text-xs transition-colors ${
                  p.id === activePipelineId
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                <button
                  className="flex-1 text-left min-w-0"
                  onClick={() => useAppStore.setState({ activePipelineId: p.id })}
                  title={p.name}
                >
                  <div className="truncate">{p.name}</div>
                  <div className="text-[10px] opacity-60">{p.nodes.length} 节点</div>
                </button>
                <button
                  className="shrink-0 p-1 rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); deletePipeline(p.id); }}
                  title="删除流程"
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>

          {/* Create button - always visible, outside scroll area */}
          <div className="shrink-0 px-3 pb-2">
            <Dialog open={showCreatePipeline} onOpenChange={setShowCreatePipeline}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" /> 新建流程
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xs">
                <DialogHeader>
                  <DialogTitle className="text-sm">新建流程</DialogTitle>
                </DialogHeader>
                <Input
                  placeholder="流程名称..."
                  value={pipelineNameInput}
                  onChange={(e) => setPipelineNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreatePipeline()}
                  className="h-8 text-sm"
                  autoFocus
                />
                <DialogFooter>
                  <Button size="sm" className="h-7 text-xs" onClick={handleCreatePipeline}>创建</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Node type palette */}
          <div className="p-3 border-t flex-1 overflow-y-auto min-h-0">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">可用节点</h3>
            <div className="flex flex-col gap-1">
              {NODE_TYPES.map((nt) => {
                const Icon = nt.icon;
                return (
                  <button
                    key={nt.type}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs hover:bg-accent transition-colors group"
                    onClick={() => handleAddNode(nt.type)}
                  >
                    <div className={`rounded-md p-1 ${nt.color} shrink-0 group-hover:scale-110 transition-transform`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{nt.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{nt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main flow area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!sidebarOpen && (
          <div className="px-3 py-2 border-b bg-muted/20">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSidebarOpen(true)}>
              <PanelLeftClose className="h-3.5 w-3.5 mr-1" /> 展开侧栏
            </Button>
          </div>
        )}

        {!activePipeline ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <GitBranch className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">选择或创建一个流程</p>
                <p className="text-xs text-muted-foreground/60 mt-1">在左侧面板新建流程，或从预设中选择</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Pipeline name bar */}
            <div className="px-4 py-2 border-b bg-background flex items-center gap-3">
              <GitBranch className="h-4 w-4 text-primary shrink-0" />
              <Input
                value={activePipeline.name}
                onChange={(e) => updatePipeline(activePipelineId!, { name: e.target.value })}
                className="h-7 text-sm font-medium max-w-xs border-transparent hover:border-input focus:border-input"
              />
              <Badge variant="secondary" className="text-[10px] h-5">
                {activePipeline.nodes.length} 个节点
              </Badge>
            </div>

            {/* Flow canvas */}
            <div className="flex-1 overflow-auto p-6">
              {/* The horizontal flow */}
              {activePipeline.nodes.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-3">
                    <div className="mx-auto w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center border-2 border-dashed border-muted-foreground/20">
                      <MousePointerClick className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">空流程</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        点击左侧的节点类型添加到流程中
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      {NODE_TYPES.map((nt) => {
                        const Icon = nt.icon;
                        return (
                          <button
                            key={nt.type}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border hover:bg-accent transition-colors ${nt.color}`}
                            onClick={() => handleAddNode(nt.type)}
                          >
                            <Icon className="h-3 w-3" />
                            {nt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Canvas with input → nodes → output */}
                  <div className="overflow-x-auto pb-4" ref={flowRef}>
                    <div className="flex items-center gap-0 min-w-max py-2">
                      {/* Input terminal */}
                      <div className="shrink-0">
                        <div className="w-20 border-2 border-dashed border-emerald-300 bg-emerald-50 rounded-xl p-2.5 text-center">
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center mx-auto mb-1">
                            <Play className="h-3.5 w-3.5 text-emerald-600" />
                          </div>
                          <p className="text-[11px] font-medium text-emerald-700">输入</p>
                          <p className="text-[9px] text-emerald-500">RGB</p>
                        </div>
                      </div>

                      <ConnectionLine />

                      {/* Sortable nodes with insert buttons */}
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={activePipeline.nodes.map((n) => n.id)} strategy={horizontalListSortingStrategy}>
                          {activePipeline.nodes.map((node, idx) => (
                            <React.Fragment key={node.id}>
                              <InsertButton onInsert={(type) => handleAddNode(type, idx)} />
                              <SortableFlowNode
                                node={node}
                                index={idx}
                                isSelected={selectedNodeId === node.id}
                                onSelect={() => setSelectedNodeId(node.id)}
                                onToggle={() => handleToggleNode(node.id)}
                                onDelete={() => handleDeleteNode(node.id)}
                                onDuplicate={() => handleDuplicateNode(node)}
                              />
                            </React.Fragment>
                          ))}
                        </SortableContext>
                      </DndContext>

                      <InsertButton onInsert={(type) => handleAddNode(type)} />

                      <ConnectionLine />

                      {/* Output terminal */}
                      <div className="shrink-0">
                        <div className="w-20 border-2 border-dashed border-rose-300 bg-rose-50 rounded-xl p-2.5 text-center">
                          <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center mx-auto mb-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-rose-600" />
                          </div>
                          <p className="text-[11px] font-medium text-rose-700">输出</p>
                          <p className="text-[9px] text-rose-500">预览</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Selected node config panel */}
                  {selectedNode && (
                    <div className="max-w-2xl">
                      <NodeConfigPanel
                        node={selectedNode}
                        onUpdate={handleUpdateNode}
                        onClose={() => setSelectedNodeId(null)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============ TAB 2: Path Simulation ============

function FlowSimulateTab() {
  const { pipelines, activePipelineId } = useAppStore();
  const [inputR, setInputR] = useState('0.5');
  const [inputG, setInputG] = useState('0.3');
  const [inputB, setInputB] = useState('0.8');
  const [steps, setSteps] = useState<SimulationStep[]>([]);
  const [totalTime, setTotalTime] = useState(0);
  const [hasRun, setHasRun] = useState(false);

  const pipeline = useMemo(() => {
    return pipelines.find((p) => p.id === activePipelineId);
  }, [pipelines, activePipelineId]);

  const handleRun = useCallback(() => {
    if (!pipeline || pipeline.nodes.length === 0) return;
    const r = clamp(parseFloat(inputR) || 0, 0, 1);
    const g = clamp(parseFloat(inputG) || 0, 0, 1);
    const b = clamp(parseFloat(inputB) || 0, 0, 1);

    let current: Vec3 = [r, g, b];
    const result: SimulationStep[] = [];
    const startTime = performance.now();
    let prevRgb: Vec3 = [r, g, b];

    for (const node of pipeline.nodes) {
      const nodeStart = performance.now();
      const input = [...current] as Vec3;
      try {
        current = applyNode(node, current);
        const nodeEnd = performance.now();

        let de: number | undefined;
        try {
          const deResult = computeDeltaEFromRGB(prevRgb[0], prevRgb[1], prevRgb[2], current[0], current[1], current[2]);
          de = deResult.deltaE;
        } catch {
          de = undefined;
        }

        result.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          inputRgb: input,
          outputRgb: [...current] as Vec3,
          params: { ...node.params },
          processingTime: nodeEnd - nodeStart,
          deltaE: de,
        });
        prevRgb = [...current] as Vec3;
      } catch {
        result.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          inputRgb: input,
          outputRgb: [...input] as Vec3,
          params: { ...node.params },
          processingTime: 0,
          deltaE: undefined,
          error: true,
        });
      }
    }

    const endTime = performance.now();
    setSteps(result);
    setTotalTime(endTime - startTime);
    setHasRun(true);
  }, [pipeline, inputR, inputG, inputB]);

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">通路模拟</CardTitle>
          <CardDescription className="text-xs">选择流程并输入 RGB 值，查看每个节点的处理结果</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">选择流程</Label>
              <Select value={activePipelineId || ''} onValueChange={(v) => useAppStore.setState({ activePipelineId: v })}>
                <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="选择..." /></SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name} ({p.nodes.length} 节点)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">R</Label>
              <Input type="number" step="0.01" min="0" max="1" value={inputR} onChange={(e) => setInputR(e.target.value)} className="w-20 h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">G</Label>
              <Input type="number" step="0.01" min="0" max="1" value={inputG} onChange={(e) => setInputG(e.target.value)} className="w-20 h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">B</Label>
              <Input type="number" step="0.01" min="0" max="1" value={inputB} onChange={(e) => setInputB(e.target.value)} className="w-20 h-8 text-xs" />
            </div>
            {/* Input color preview */}
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-md border shadow-sm"
                style={{ backgroundColor: `rgb(${Math.round(clamp(parseFloat(inputR) || 0, 0, 1) * 255)}, ${Math.round(clamp(parseFloat(inputG) || 0, 0, 1) * 255)}, ${Math.round(clamp(parseFloat(inputB) || 0, 0, 1) * 255)})` }}
              />
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={handleRun} disabled={!pipeline || pipeline.nodes.length === 0}>
              <Play className="h-3 w-3 mr-1" /> 运行模拟
            </Button>
          </div>
        </CardContent>
      </Card>

      {!hasRun ? (
        <div className="text-center py-12 text-muted-foreground">
          <Zap className="h-8 w-8 mx-auto opacity-30 mb-2" />
          <p className="text-sm">选择流程并输入 RGB 值，点击"运行模拟"查看结果</p>
        </div>
      ) : steps.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">流程中没有节点</p>
      ) : (
        <>
          {/* Horizontal result flow */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-muted-foreground">模拟结果</p>
                <Badge variant="outline" className="text-[10px] h-5">
                  <Clock className="h-2.5 w-2.5 mr-1" />
                  {totalTime.toFixed(2)}ms
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <div className="flex items-center gap-0 min-w-max">
                  {/* Input */}
                  <div className="w-28 shrink-0 border border-dashed rounded-xl p-2 text-center">
                    <p className="text-[10px] font-medium text-emerald-600 mb-1">输入</p>
                    <ColorSwatch r={steps[0].inputRgb[0]} g={steps[0].inputRgb[1]} b={steps[0].inputRgb[2]} size="sm" />
                    <p className="text-[9px] font-mono text-muted-foreground mt-1">
                      {rgbToDisplay(...steps[0].inputRgb)}
                    </p>
                  </div>

                  {steps.map((step, idx) => (
                    <React.Fragment key={step.nodeId}>
                      <div className="shrink-0 flex items-center">
                        <div className="w-6 h-px bg-border" />
                        <div className="w-0 h-0 border-l-[4px] border-l-muted-foreground/40 border-y-[2px] border-y-transparent" />
                      </div>
                      <div className="w-32 shrink-0 border rounded-xl p-2 text-center hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          {getNodeIcon(step.nodeType, 'h-3 w-3')}
                          <p className="text-[10px] font-medium truncate">{step.nodeName}</p>
                        </div>
                        <ColorSwatch r={step.outputRgb[0]} g={step.outputRgb[1]} b={step.outputRgb[2]} size="sm" />
                        <p className="text-[9px] font-mono text-muted-foreground mt-1">
                          {rgbToDisplay(...step.outputRgb)}
                        </p>
                        {step.deltaE !== undefined && step.deltaE > 0.01 && (
                          <Badge variant="secondary" className="text-[8px] h-3.5 mt-1 px-1">
                            ΔE {step.deltaE.toFixed(2)}
                          </Badge>
                        )}
                      </div>
                    </React.Fragment>
                  ))}

                  {/* Output arrow + label */}
                  <div className="shrink-0 flex items-center">
                    <div className="w-6 h-px bg-border" />
                    <div className="w-0 h-0 border-l-[4px] border-l-muted-foreground/40 border-y-[2px] border-y-transparent" />
                  </div>
                  <div className="w-28 shrink-0 border-2 border-dashed border-rose-200 rounded-xl p-2 text-center bg-rose-50/50">
                    <p className="text-[10px] font-medium text-rose-600 mb-1">输出</p>
                    <ColorSwatch r={steps[steps.length - 1].outputRgb[0]} g={steps[steps.length - 1].outputRgb[1]} b={steps[steps.length - 1].outputRgb[2]} size="sm" />
                    <p className="text-[9px] font-mono text-muted-foreground mt-1">
                      {rgbToDisplay(...steps[steps.length - 1].outputRgb)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step detail table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">节点详情</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 px-2 text-left font-medium text-muted-foreground">#</th>
                      <th className="py-2 px-2 text-left font-medium text-muted-foreground">节点</th>
                      <th className="py-2 px-2 text-left font-medium text-muted-foreground">参数</th>
                      <th className="py-2 px-2 text-left font-medium text-muted-foreground">输入 RGB</th>
                      <th className="py-2 px-2 text-left font-medium text-muted-foreground">输出 RGB</th>
                      <th className="py-2 px-2 text-center font-medium text-muted-foreground">ΔE</th>
                      <th className="py-2 px-2 text-right font-medium text-muted-foreground">耗时</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((step, idx) => (
                      <tr key={step.nodeId} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 px-2"><Badge variant="secondary" className="text-[9px] h-4">{idx + 1}</Badge></td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1.5">
                            {getNodeIcon(step.nodeType, 'h-3 w-3')}
                            <span className="font-medium">{step.nodeName}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{getNodeSummary({ ...step, params: step.params, enabled: true } as PipelineNode)}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-4 rounded border" style={{ backgroundColor: rgbToHex(...step.inputRgb) }} />
                            <span className="font-mono">{rgbToDisplay(...step.inputRgb)}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-4 rounded border" style={{ backgroundColor: rgbToHex(...step.outputRgb) }} />
                            <span className="font-mono">{rgbToDisplay(...step.outputRgb)}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center">
                          {step.deltaE !== undefined && step.deltaE > 0.01 ? (
                            <Badge variant={step.deltaE > 3 ? 'destructive' : 'secondary'} className="text-[9px] h-4">
                              {step.deltaE.toFixed(2)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right text-muted-foreground">{step.processingTime.toFixed(3)}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ============ TAB 3: Flow Presets ============

function FlowPresetsTab() {
  const {
    pipelines, activePipelineId, getActivePipeline, createPipeline, updatePipeline,
    customPresets, addCustomPreset, deleteCustomPreset,
  } = useAppStore();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDesc, setPresetDesc] = useState('');

  const activePipeline = getActivePipeline();

  const handleUsePreset = useCallback((presetNodes: PipelineNode[]) => {
    const newId = createPipeline(`预设流程`);
    // Give nodes new IDs
    const nodesWithNewIds = presetNodes.map((n) => ({
      ...n,
      id: generateNodeId(),
      params: { ...n.params },
    }));
    updatePipeline(newId, { nodes: nodesWithNewIds, name: `预设流程` });
    useAppStore.getState().setActiveTab('flow-manage');
  }, [createPipeline, updatePipeline]);

  const handleSavePreset = useCallback(() => {
    if (!activePipeline || !presetName.trim()) return;
    addCustomPreset({
      name: presetName.trim(),
      description: presetDesc.trim() || `${activePipeline.nodes.length} 个节点的自定义流程`,
      nodes: activePipeline.nodes,
    });
    setPresetName('');
    setPresetDesc('');
    setSaveDialogOpen(false);
  }, [activePipeline, presetName, presetDesc, addCustomPreset]);

  return (
    <div className="p-4 space-y-6 max-w-4xl">
      {/* Built-in presets */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="text-xs">内置</Badge>
          <h3 className="text-sm font-semibold">内置预设</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {BUILT_IN_PRESETS.map((preset) => (
            <Card key={preset.id} className="group hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <h4 className="text-sm font-medium mb-1">{preset.name}</h4>
                <p className="text-[11px] text-muted-foreground mb-3">{preset.description}</p>
                {/* Mini flow preview */}
                <div className="flex items-center gap-1 mb-3 overflow-hidden">
                  <div className="shrink-0 w-6 h-6 rounded bg-emerald-100 flex items-center justify-center">
                    <Play className="h-2.5 w-2.5 text-emerald-600" />
                  </div>
                  <div className="w-3 h-px bg-border" />
                  {preset.nodes.map((node, idx) => (
                    <React.Fragment key={node.id}>
                      <div className="shrink-0 max-w-20">
                        <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/50 text-[9px]">
                          {getNodeIcon(node.type, 'h-2.5 w-2.5')}
                          <span className="truncate">{getNodeSummary(node)}</span>
                        </div>
                      </div>
                      {idx < preset.nodes.length - 1 && <div className="w-2 h-px bg-border" />}
                    </React.Fragment>
                  ))}
                  <div className="w-3 h-px bg-border" />
                  <div className="shrink-0 w-6 h-6 rounded bg-rose-100 flex items-center justify-center">
                    <CheckCircle2 className="h-2.5 w-2.5 text-rose-600" />
                  </div>
                </div>
                <Button size="sm" className="w-full h-7 text-xs" onClick={() => handleUsePreset(preset.nodes)}>
                  使用此预设
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Separator />

      {/* Custom presets */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">自定义</Badge>
            <h3 className="text-sm font-semibold">自定义预设</h3>
            <Badge variant="outline" className="text-[10px]">{customPresets.length}</Badge>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSaveDialogOpen(true)}
            disabled={!activePipeline || activePipeline.nodes.length === 0}>
            <Save className="h-3 w-3 mr-1" /> 保存当前流程为预设
          </Button>
        </div>

        {customPresets.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed rounded-xl">
            <p className="text-xs text-muted-foreground">暂无自定义预设</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">在流程管理中创建流程后，可保存为自定义预设</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {customPresets.map((preset) => (
              <Card key={preset.id} className="group hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <h4 className="text-sm font-medium truncate">{preset.name}</h4>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={() => deleteCustomPreset(preset.id)}>
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2">{preset.description}</p>
                  <Badge variant="outline" className="text-[9px] h-4 mb-3">{preset.nodes.length} 个节点</Badge>
                  <Button size="sm" className="w-full h-7 text-xs" onClick={() => handleUsePreset(preset.nodes)}>
                    使用此预设
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Save preset dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">保存为自定义预设</DialogTitle>
            <DialogDescription className="text-xs">将当前流程保存为可复用的预设模板</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">预设名称</Label>
              <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="输入预设名称..."
                className="h-8 text-sm" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">描述</Label>
              <Input value={presetDesc} onChange={(e) => setPresetDesc(e.target.value)} placeholder="简要描述..."
                className="h-8 text-sm" />
            </div>
            {activePipeline && (
              <p className="text-[10px] text-muted-foreground">
                将保存当前流程的 {activePipeline.nodes.length} 个节点
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSaveDialogOpen(false)}>取消</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSavePreset} disabled={!presetName.trim()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ TAB 4: Batch Processing ============

function BatchProcessTab() {
  const { pipelines, activePipelineId } = useAppStore();
  const [batchMode, setBatchMode] = useState<'csv' | 'image'>('csv');
  const [csvRows, setCsvRows] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<CsvRow[]>([]);
  const [outputFormat, setOutputFormat] = useState<string>('float');
  const [processedResults, setProcessedResults] = useState<(CsvRow & { outR: number; outG: number; outB: number })[]>([]);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const pipeline = useMemo(() => {
    return pipelines.find((p) => p.id === activePipelineId);
  }, [pipelines, activePipelineId]);

  // Parse CSV
  const handleParseCSV = useCallback((text: string) => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) { setCsvRows([]); setParsedData([]); return; }

    // Detect delimiter
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const delim = tabCount > commaCount ? '\t' : ',';

    const data: CsvRow[] = [];
    for (const line of lines) {
      const parts = line.split(delim).map((s) => s.trim());
      if (parts.length < 3) continue;
      const rStr = parts[0];
      const gStr = parts[1];
      const bStr = parts[2];
      const rNum = parseFloat(rStr);
      const gNum = parseFloat(gStr);
      const bNum = parseFloat(bStr);
      if (isNaN(rNum) || isNaN(gNum) || isNaN(bNum)) continue;
      // Skip header row (non-numeric first values)
      if (data.length === 0 && (isNaN(parseFloat(rStr)) || isNaN(parseFloat(gStr)) || isNaN(parseFloat(bStr)))) continue;
      data.push({ rawR: rStr, rawG: gStr, rawB: bStr, numR: rNum, numG: gNum, numB: bNum, outR: rNum, outG: gNum, outB: bNum });
    }
    setCsvRows(lines);
    setParsedData(data);
    setProcessedResults([]);
    setHasProcessed(false);
  }, []);

  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      handleParseCSV(e.target?.result as string);
    };
    reader.readAsText(file);
  }, [handleParseCSV]);

  const formatOutput = (val: number): string => {
    const clamped = Math.max(0, Math.min(1, val));
    switch (outputFormat) {
      case '8bit': return Math.round(clamped * 255).toString();
      case '10bit': return Math.round(clamped * 1023).toString();
      case '12bit': return Math.round(clamped * 4095).toString();
      case '16bit': return Math.round(clamped * 65535).toString();
      default: return clamped.toFixed(6);
    }
  };

  // Batch process
  const handleProcess = useCallback(() => {
    if (!pipeline || pipeline.nodes.length === 0 || parsedData.length === 0) return;
    setProcessing(true);

    const startTime = performance.now();
    const results: (CsvRow & { outR: number; outG: number; outB: number })[] = [];

    for (const row of parsedData) {
      let rgb: Vec3 = [row.numR, row.numG, row.numB];
      let error = false;
      for (const node of pipeline.nodes) {
        try {
          rgb = applyNode(node, rgb);
        } catch {
          error = true;
          break;
        }
      }
      results.push({ ...row, outR: clamp(rgb[0], 0, 1), outG: clamp(rgb[1], 0, 1), outB: clamp(rgb[2], 0, 1), error });
    }

    setProcessedResults(results);
    setHasProcessed(true);
    setProcessing(false);
    console.log(`CSV batch: ${results.length} rows processed in ${(performance.now() - startTime).toFixed(1)}ms`);
  }, [pipeline, parsedData]);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    if (processedResults.length === 0) return;
    const header = '原R,原G,原B,输出R,输出G,输出B';
    const rows = processedResults.map((r) =>
      `${r.rawR},${r.rawG},${r.rawB},${formatOutput(r.outR)},${formatOutput(r.outG)},${formatOutput(r.outB)}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'batch_result.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [processedResults, formatOutput]);

  // Copy to clipboard
  const handleCopy = useCallback(() => {
    if (processedResults.length === 0) return;
    const header = '原R\t原G\t原B\t输出R\t输出G\t输出B';
    const rows = processedResults.map((r) =>
      `${r.rawR}\t${r.rawG}\t${r.rawB}\t${formatOutput(r.outR)}\t${formatOutput(r.outG)}\t${formatOutput(r.outB)}`
    );
    const text = [header, ...rows].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  }, [processedResults, formatOutput, setCopySuccess]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.tsv') || file.name.endsWith('.txt'))) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const imageInputRef = useRef<HTMLInputElement>(null);

  // Multi-image batch state
  interface ImageItem {
    id: string;
    name: string;
    width: number;
    height: number;
    srcUrl: string;
    dstUrl: string | null;
    status: 'pending' | 'processing' | 'done' | 'error';
  }
  const [imageList, setImageList] = useState<ImageItem[]>([]);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [imageProgress, setImageProgress] = useState({ current: 0, total: 0 });
  // Preview dialog state
  const [previewItem, setPreviewItem] = useState<ImageItem | null>(null);

  const handleImageUpload = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: ImageItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      const url = URL.createObjectURL(file);
      newItems.push({
        id: `img_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
        name: file.name,
        width: 0,
        height: 0,
        srcUrl: url,
        dstUrl: null,
        status: 'pending',
      });
      // Load dimensions
      const img = new Image();
      const idx = newItems.length - 1;
      img.onload = () => {
        setImageList((prev) => {
          const updated = [...prev];
          const existIdx = updated.findIndex((item) => item.srcUrl === url);
          if (existIdx >= 0) {
            updated[existIdx] = { ...updated[existIdx], width: img.width, height: img.height };
          }
          return updated;
        });
      };
      img.src = url;
    }
    setImageList((prev) => [...prev, ...newItems]);
  }, []);

  const handleProcessAllImages = useCallback(async () => {
    if (!pipeline || pipeline.nodes.length === 0 || imageList.length === 0) return;
    setImageProcessing(true);
    const total = imageList.length;
    setImageProgress({ current: 0, total });

    const updated = [...imageList];

    for (let idx = 0; idx < total; idx++) {
      updated[idx] = { ...updated[idx], status: 'processing' };
      setImageList([...updated]);
      setImageProgress({ current: idx + 1, total });

      try {
        const item = updated[idx];
        const result = await new Promise<string>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject('Canvas context error'); return; }
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
              let rgb: Vec3 = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
              for (const node of pipeline.nodes) {
                try { rgb = applyNode(node, rgb); } catch { break; }
              }
              data[i] = Math.round(clamp(rgb[0], 0, 1) * 255);
              data[i + 1] = Math.round(clamp(rgb[1], 0, 1) * 255);
              data[i + 2] = Math.round(clamp(rgb[2], 0, 1) * 255);
            }
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = () => reject('Image load error');
          img.src = item.srcUrl;
        });
        updated[idx] = { ...updated[idx], dstUrl: result, status: 'done' };
      } catch {
        updated[idx] = { ...updated[idx], status: 'error' };
      }
      setImageList([...updated]);

      // Yield to UI
      await new Promise((r) => setTimeout(r, 10));
    }

    setImageProcessing(false);
  }, [pipeline, imageList]);

  const handleDownloadImage = useCallback((item: ImageItem) => {
    if (!item.dstUrl) return;
    const a = document.createElement('a');
    a.href = item.dstUrl;
    a.download = `processed_${item.name.replace(/\.[^.]+$/, '')}.png`;
    a.click();
  }, []);

  const handleRemoveImage = useCallback((id: string) => {
    setImageList((prev) => prev.filter((item) => item.id !== id));
    if (previewItem?.id === id) setPreviewItem(null);
  }, [previewItem]);

  const handleClearImages = useCallback(() => {
    setImageList([]);
    setPreviewItem(null);
  }, []);

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      {/* Mode Switcher */}
      <div className="flex gap-2">
        <Button
          variant={batchMode === 'csv' ? 'default' : 'outline'}
          size="sm"
          className="text-xs h-7"
          onClick={() => setBatchMode('csv')}
        >
          <FileText className="h-3 w-3 mr-1.5" /> CSV 批量处理
        </Button>
        <Button
          variant={batchMode === 'image' ? 'default' : 'outline'}
          size="sm"
          className="text-xs h-7"
          onClick={() => setBatchMode('image')}
        >
          <ImageIcon className="h-3 w-3 mr-1.5" /> 图片批处理
        </Button>
      </div>

      {batchMode === 'csv' && (
        <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">CSV 批量处理</CardTitle>
          <CardDescription className="text-xs">导入 CSV 文件，选择流程进行批量色彩转换处理</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Config row */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium">选择流程</Label>
              <Select value={activePipelineId || ''} onValueChange={(v) => useAppStore.setState({ activePipelineId: v })}>
                <SelectTrigger className="w-52 h-8 text-xs"><SelectValue placeholder="选择流程..." /></SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name} ({p.nodes.length} 节点)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">输出格式</Label>
              <Select value={outputFormat} onValueChange={setOutputFormat}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="float" className="text-xs">0-1 浮点数</SelectItem>
                  <SelectItem value="8bit" className="text-xs">8-bit (0-255)</SelectItem>
                  <SelectItem value="10bit" className="text-xs">10-bit (0-1023)</SelectItem>
                  <SelectItem value="12bit" className="text-xs">12-bit (0-4095)</SelectItem>
                  <SelectItem value="16bit" className="text-xs">16-bit (0-65535)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Upload area */}
          <div
            className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
            onClick={() => csvInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={handleDrop}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium">拖拽或点击上传 CSV 文件</p>
            <p className="text-xs text-muted-foreground mt-1">支持 .csv / .tsv / .txt，每行 3 列 (R, G, B)</p>
            <input ref={csvInputRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => { if (e.target.files[0]) handleFileUpload(e.target.files[0]); }} />
          </div>

          {/* Data Preview */}
          {parsedData.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">数据预览 ({parsedData.length} 行)</p>
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setCsvRows([]); setParsedData([]); setProcessedResults([]); setHasProcessed(false); }}>清空</Button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-medium border-b">R</th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium border-b">G</th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium border-b">B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 100).map((row, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-3 py-1 text-left border-b border-muted/50">{row.rawR}</td>
                        <td className="px-3 py-1 text-left border-b border-muted/50">{row.rawG}</td>
                        <td className="px-3 py-1 text-left border-b border-muted/50">{row.rawB}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedData.length > 100 && <p className="text-[10px] text-muted-foreground text-center">仅显示前 100 行</p>}
            </div>
          )}

          {/* Process button */}
          <Button
            className="w-full text-xs"
            onClick={handleProcess}
            disabled={!pipeline || pipeline.nodes.length === 0 || parsedData.length === 0 || processing}
          >
            {processing ? (
              <><CircleDot className="h-3 w-3 mr-1.5 animate-spin" /> 处理中...</>
            ) : (
              <><Play className="h-3 w-3 mr-1.5" /> 开始批量处理 ({parsedData.length} 行)</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {hasProcessed && processedResults.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">处理结果</CardTitle>
                <CardDescription className="text-xs">输出格式: {outputFormat === 'float' ? '0-1 浮点' : `${outputFormat} (0-${outputFormat === '8bit' ? '255' : outputFormat === '10bit' ? '1023' : outputFormat === '12bit' ? '4095' : '65535'})`}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={handleExportCSV}>
                  <Download className="h-3 w-3 mr-1" /> 写回 CSV
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={handleCopy}>
                  <Copy className="h-3 w-3 mr-1" /> {copySuccess ? '已复制!' : '复制到剪贴板'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto rounded-lg border">
              <table className="w-full text-xs font-mono">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-center text-[10px] font-medium border-b">原R</th>
                    <th className="px-2 py-2 text-center text-[10px] font-medium border-b">原G</th>
                    <th className="px-2 py-2 text-center text-[10px] font-medium border-b">原B</th>
                    <th className="px-2 py-2 text-center text-[10px] font-medium border-b text-green-600">输出R</th>
                    <th className="px-2 py-2 text-center text-[10px] font-medium border-b text-green-600">输出G</th>
                    <th className="px-2 py-2 text-center text-[10px] font-medium border-b text-green-600">输出B</th>
                    <th className="px-2 py-2 text-center text-[10px] font-medium border-b">色块</th>
                  </tr>
                </thead>
                <tbody>
                  {processedResults.map((row, i) => (
                    <tr key={i} className={row.error ? 'bg-destructive/5' : 'hover:bg-muted/30'}>
                      <td className="px-2 py-1 text-center border-b border-muted/50">{row.rawR}</td>
                      <td className="px-2 py-1 text-center border-b border-muted/50">{row.rawG}</td>
                      <td className="px-2 py-1 text-center border-b border-muted/50">{row.rawB}</td>
                      <td className="px-2 py-1 text-center border-b border-muted/50 text-green-700">{formatOutput(row.outR)}</td>
                      <td className="px-2 py-1 text-center border-b border-muted/50 text-green-700">{formatOutput(row.outG)}</td>
                      <td className="px-2 py-1 text-center border-b border-muted/50 text-green-700">{formatOutput(row.outB)}</td>
                      <td className="px-2 py-1 border-b border-muted/50">
                        <div
                          className="w-6 h-4 mx-auto rounded-sm border"
                          style={{
                            backgroundColor: `rgb(${Math.round(clamp(row.outR, 0, 1) * 255)},${Math.round(clamp(row.outG, 0, 1) * 255)},${Math.round(clamp(row.outB, 0, 1) * 255)})`,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {processedResults.length > 100 && <p className="text-[10px] text-muted-foreground text-center mt-2">仅显示前 100 行</p>}
          </CardContent>
        </Card>
      )}
        </>
      )}

      {batchMode === 'image' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">图片批处理</CardTitle>
            <CardDescription className="text-xs">上传多张图片，通过流程进行逐像素色彩转换处理</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pipeline selector */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">选择流程</Label>
                <Select value={activePipelineId || ''} onValueChange={(v) => useAppStore.setState({ activePipelineId: v })}>
                  <SelectTrigger className="w-52 h-8 text-xs"><SelectValue placeholder="选择流程..." /></SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">{p.name} ({p.nodes.length} 节点)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {imageList.length > 0 && (
                <span className="text-xs text-muted-foreground pb-1">
                  已添加 {imageList.length} 张图片
                </span>
              )}
            </div>

            {/* Upload area */}
            <div
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
              onClick={() => imageInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm font-medium">拖拽或点击上传图片（支持多选）</p>
              <p className="text-xs text-muted-foreground mt-1">支持 PNG / JPEG / WebP，可一次选择多张</p>
              <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { handleImageUpload(e.target.files); e.target.value = ''; }} />
            </div>

            {/* Image list */}
            {imageList.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">图片列表 ({imageList.length} 张)</p>
                  <div className="flex gap-2">
                    <Button
                      className="text-xs h-7"
                      size="sm"
                      onClick={handleProcessAllImages}
                      disabled={!pipeline || pipeline.nodes.length === 0 || imageProcessing}
                    >
                      {imageProcessing ? (
                        <><CircleDot className="h-3 w-3 mr-1.5 animate-spin" /> 处理中 ({imageProgress.current}/{imageProgress.total})...</>
                      ) : (
                        <><Play className="h-3 w-3 mr-1.5" /> 全部处理</>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={handleClearImages}>
                      清空全部
                    </Button>
                  </div>
                </div>

                {/* Progress bar */}
                {imageProcessing && (
                  <div className="space-y-1">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${imageProgress.total > 0 ? (imageProgress.current / imageProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center">
                      {imageProgress.current} / {imageProgress.total}
                    </p>
                  </div>
                )}

                {/* Image cards */}
                <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1">
                  {imageList.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                      {/* Thumbnail — clickable for preview */}
                      <button
                        className="w-16 h-16 rounded-md border overflow-hidden bg-checkered flex-shrink-0 cursor-pointer relative"
                        onClick={() => setPreviewItem(item)}
                        title={item.status === 'done' ? '点击预览前后对比' : '点击预览'}
                      >
                        <img
                          src={item.dstUrl || item.srcUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                        {item.status === 'done' && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            <Eye className="w-5 h-5 text-white" />
                          </div>
                        )}
                      </button>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{item.name}</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          {item.width > 0 && <span>{item.width}×{item.height}</span>}
                          <Badge
                            variant={
                              item.status === 'done' ? 'default' :
                              item.status === 'processing' ? 'secondary' :
                              item.status === 'error' ? 'destructive' : 'outline'
                            }
                            className="text-[9px] px-1.5 py-0 h-4"
                          >
                            {item.status === 'pending' ? '待处理' :
                             item.status === 'processing' ? '处理中' :
                             item.status === 'done' ? '已完成' : '失败'}
                          </Badge>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {item.status === 'done' && item.dstUrl && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownloadImage(item)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleRemoveImage(item.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Before/After preview dialog */}
                <Dialog open={!!previewItem} onOpenChange={(open) => { if (!open) setPreviewItem(null); }}>
                  {previewItem && (
                    <DialogContent className="max-w-4xl">
                      <DialogHeader>
                        <DialogTitle className="text-sm">{previewItem.name}</DialogTitle>
                        <DialogDescription className="text-xs">
                          {previewItem.width}×{previewItem.height}
                          {previewItem.status === 'done' && ' — 点击「已完成」图片查看处理后版本'}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        {/* Comparison */}
                        {previewItem.status === 'done' && previewItem.dstUrl ? (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-center">原图</p>
                              <div className="rounded-lg border overflow-hidden bg-checkered">
                                <img src={previewItem.srcUrl} alt="原图" className="w-full h-auto max-h-[60vh] object-contain" />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-center">处理后</p>
                              <div className="rounded-lg border overflow-hidden bg-checkered">
                                <img src={previewItem.dstUrl} alt="处理后" className="w-full h-auto max-h-[60vh] object-contain" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-center">
                            <div className="rounded-lg border overflow-hidden bg-checkered">
                              <img src={previewItem.srcUrl} alt="原图" className="w-full h-auto max-h-[60vh] object-contain" />
                            </div>
                          </div>
                        )}
                        <DialogFooter className="flex gap-2 sm:justify-end">
                          {previewItem.status === 'done' && previewItem.dstUrl && (
                            <Button size="sm" onClick={() => handleDownloadImage(previewItem)}>
                              <Download className="h-3.5 w-3.5 mr-1.5" /> 下载处理后
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => setPreviewItem(null)}>
                            关闭
                          </Button>
                        </DialogFooter>
                      </div>
                    </DialogContent>
                  )}
                </Dialog>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============ TAB 5: Intermediate Results ============

function IntermediateViewTab() {
  const { pipelines, activePipelineId } = useAppStore();
  const [inputR, setInputR] = useState('0.5');
  const [inputG, setInputG] = useState('0.3');
  const [inputB, setInputB] = useState('0.8');
  const [steps, setSteps] = useState<SimulationStep[]>([]);
  const [viewNodeId, setViewNodeId] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const pipeline = useMemo(() => {
    return pipelines.find((p) => p.id === activePipelineId);
  }, [pipelines, activePipelineId]);

  const handleRun = useCallback(() => {
    if (!pipeline || pipeline.nodes.length === 0) return;
    const r = clamp(parseFloat(inputR) || 0, 0, 1);
    const g = clamp(parseFloat(inputG) || 0, 0, 1);
    const b = clamp(parseFloat(inputB) || 0, 0, 1);

    let current: Vec3 = [r, g, b];
    const result: SimulationStep[] = [];
    let prevRgb: Vec3 = [r, g, b];

    for (const node of pipeline.nodes) {
      const nodeStart = performance.now();
      const input = [...current] as Vec3;
      current = applyNode(node, current);
      const nodeEnd = performance.now();

      let de: number | undefined;
      try {
        const deResult = computeDeltaEFromRGB(prevRgb[0], prevRgb[1], prevRgb[2], current[0], current[1], current[2]);
        de = deResult.deltaE;
      } catch {
        de = undefined;
      }

      result.push({
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        inputRgb: input,
        outputRgb: [...current] as Vec3,
        params: { ...node.params },
        processingTime: nodeEnd - nodeStart,
        deltaE: de,
      });
      prevRgb = [...current] as Vec3;
    }

    setSteps(result);
    setHasRun(true);
    if (result.length > 0) setViewNodeId(result[0].nodeId);
  }, [pipeline, inputR, inputG, inputB]);

  const viewStep = steps.find((s) => s.nodeId === viewNodeId);
  const viewStepIndex = steps.findIndex((s) => s.nodeId === viewNodeId);

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">选择流程</Label>
              <Select value={activePipelineId || ''} onValueChange={(v) => useAppStore.setState({ activePipelineId: v })}>
                <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="选择..." /></SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name} ({p.nodes.length} 节点)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">R</Label>
              <Input type="number" step="0.01" min="0" max="1" value={inputR} onChange={(e) => setInputR(e.target.value)} className="w-20 h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">G</Label>
              <Input type="number" step="0.01" min="0" max="1" value={inputG} onChange={(e) => setInputG(e.target.value)} className="w-20 h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">B</Label>
              <Input type="number" step="0.01" min="0" max="1" value={inputB} onChange={(e) => setInputB(e.target.value)} className="w-20 h-8 text-xs" />
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={handleRun} disabled={!pipeline || pipeline.nodes.length === 0}>
              <Play className="h-3 w-3 mr-1" /> 运行
            </Button>
          </div>
        </CardContent>
      </Card>

      {!hasRun ? (
        <div className="text-center py-12 text-muted-foreground">
          <Eye className="h-8 w-8 mx-auto opacity-30 mb-2" />
          <p className="text-sm">运行模拟后，点击任意节点查看详细中间结果</p>
        </div>
      ) : steps.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">流程中没有节点</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Node list */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">节点列表</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-96">
                <div className="flex flex-col">
                  {/* Input */}
                  <button
                    className="flex items-center gap-2 px-3 py-2 border-b text-xs hover:bg-muted/50 transition-colors text-left"
                    onClick={() => setViewNodeId(null)}
                  >
                    <div className="w-6 h-6 rounded bg-emerald-100 flex items-center justify-center shrink-0">
                      <Play className="h-3 w-3 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium">输入</p>
                      <p className="text-[10px] text-muted-foreground">{rgbToDisplay(steps[0].inputRgb[0], steps[0].inputRgb[1], steps[0].inputRgb[2])}</p>
                    </div>
                  </button>

                  {steps.map((step, idx) => (
                    <button
                      key={step.nodeId}
                      className={`flex items-center gap-2 px-3 py-2 border-b text-xs transition-colors text-left ${
                        viewNodeId === step.nodeId ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setViewNodeId(step.nodeId)}
                    >
                      <div className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                        style={{ backgroundColor: rgbToHex(step.outputRgb[0], step.outputRgb[1], step.outputRgb[2]) }}>
                        <span className="text-[8px] font-bold text-white mix-blend-difference">{idx + 1}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{step.nodeName}</p>
                        <p className="text-[10px] text-muted-foreground">{rgbToDisplay(...step.outputRgb)}</p>
                      </div>
                      {step.deltaE !== undefined && step.deltaE > 0.01 && (
                        <Badge variant="secondary" className="text-[9px] h-4 shrink-0">
                          ΔE{step.deltaE.toFixed(1)}
                        </Badge>
                      )}
                    </button>
                  ))}

                  {/* Output */}
                  <button className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors text-left">
                    <div className="w-6 h-6 rounded bg-rose-100 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-3 w-3 text-rose-600" />
                    </div>
                    <div>
                      <p className="font-medium">输出</p>
                      <p className="text-[10px] text-muted-foreground">{rgbToDisplay(...steps[steps.length - 1].outputRgb)}</p>
                    </div>
                  </button>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Detail panel */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {viewStep ? (
                  <div className="flex items-center gap-2">
                    {getNodeIcon(viewStep.nodeType, 'h-4 w-4')}
                    {viewStep.nodeName}
                    <Badge variant="outline" className="text-[10px]">#{viewStepIndex + 1}</Badge>
                  </div>
                ) : '输入'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {viewStep ? (
                <div className="space-y-4">
                  {/* Params */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">节点参数</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(viewStep.params).map(([key, val]) => (
                        <div key={key} className="px-2 py-1.5 rounded bg-muted/50 text-xs">
                          <span className="text-muted-foreground">{key}: </span>
                          <span className="font-medium">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Input vs Output */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">输入</p>
                      <div className="flex items-center gap-3">
                        <ColorSwatch r={viewStep.inputRgb[0]} g={viewStep.inputRgb[1]} b={viewStep.inputRgb[2]} size="lg" />
                        <div className="space-y-0.5">
                          <p className="text-xs font-mono">{rgbToDisplay(...viewStep.inputRgb)}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{rgbToHex(...viewStep.inputRgb)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">输出</p>
                      <div className="flex items-center gap-3">
                        <ColorSwatch r={viewStep.outputRgb[0]} g={viewStep.outputRgb[1]} b={viewStep.outputRgb[2]} size="lg" />
                        <div className="space-y-0.5">
                          <p className="text-xs font-mono">{rgbToDisplay(...viewStep.outputRgb)}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{rgbToHex(...viewStep.outputRgb)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Delta E */}
                  {viewStep.deltaE !== undefined && viewStep.deltaE > 0.01 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                      <span className="text-xs font-medium text-muted-foreground">与上一步的 ΔE:</span>
                      <Badge variant={viewStep.deltaE > 3 ? 'destructive' : 'secondary'} className="text-xs">
                        {viewStep.deltaE.toFixed(4)}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        ({viewStep.deltaE < 1 ? '不可察觉' : viewStep.deltaE < 3 ? '轻微差异' : '明显差异'})
                      </span>
                    </div>
                  )}

                  {/* Processing time */}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    处理耗时: {viewStep.processingTime.toFixed(3)}ms
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 py-4">
                  <p className="text-xs text-muted-foreground">原始输入值:</p>
                  <ColorSwatch r={steps[0].inputRgb[0]} g={steps[0].inputRgb[1]} b={steps[0].inputRgb[2]} size="lg" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-mono">{rgbToDisplay(...steps[0].inputRgb)}</p>
                    <p className="text-xs text-muted-foreground font-mono">{rgbToHex(...steps[0].inputRgb)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============ Main Module ============

export default function PipelineModule() {
  const { activeTab, setActiveTab } = useAppStore();

  const tabs = [
    { id: 'flow-manage', label: '流程管理', icon: GitBranch },
    { id: 'flow-simulate', label: '通路模拟', icon: Zap },
    { id: 'flow-presets', label: '流程预设', icon: Layers },
    { id: 'batch-process', label: '批处理', icon: FileText },
    { id: 'intermediate-view', label: '中间结果查看', icon: Eye },
  ];

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab bar */}
      <div className="shrink-0 border-b bg-background">
        <div className="flex items-center px-2 gap-0.5 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {currentTab.id === 'flow-manage' && <FlowManageTab />}
        {currentTab.id === 'flow-simulate' && <FlowSimulateTab />}
        {currentTab.id === 'flow-presets' && <FlowPresetsTab />}
        {currentTab.id === 'batch-process' && <BatchProcessTab />}
        {currentTab.id === 'intermediate-view' && <IntermediateViewTab />}
      </div>
    </div>
  );
}
