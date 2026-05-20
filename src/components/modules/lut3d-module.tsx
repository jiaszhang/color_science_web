'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  createLUT3D,
  createColorSpaceLUT,
  applyLUT3D,
  chainLUTs,
  exportLUTToCube,
  parseCubeFile,
  parseCSVLut,
  applyLUTToImageData,
  upsampleLUT,
  adjustLUTGamut,
  type LUT3D,
} from '@/lib/color-science/lut3d';
import { getGamutNames, getTransferFunctionNames, type TransferFunctionName } from '@/lib/color-science';
import { useAppStore } from '@/lib/store/app-store';
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
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Palette,
  Wand2,
  Layers,
  FileUp,
  FileDown,
  Upload,
  Download,
  Copy,
  Trash2,
  Pencil,
  Link2,
  Unlink,
  Play,
  Check,
  AlertCircle,
  Image as ImageIcon,
  ArrowRight,
  Grid3x3,
  Expand,
  Info,

} from 'lucide-react';

// ============ Helpers ============

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => {
    const clamped = clamp(Math.round(v * 255), 0, 255);
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function generateId(): string {
  return `lut_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function libraryToLUT3D(entry: {
  name: string;
  size: number;
  data: Float32Array;
  srcGamut?: string;
  dstGamut?: string;
}): LUT3D {
  return {
    name: entry.name,
    size: entry.size,
    data: entry.data,
    inputRange: { min: 0, max: 1 },
    outputRange: { min: 0, max: 1 },
    srcGamut: entry.srcGamut,
    dstGamut: entry.dstGamut,
  };
}

// ============ Component ============

export default function Lut3dModule() {
  // Store
  const { lutLibrary, addLUT, removeLUT, renameLUT, activeTab, setActiveTab } = useAppStore();

  const currentTab = ['lut-apply', 'lut-generate', 'lut-extract', 'lut-manage', 'lut-import', 'lut-export'].includes(activeTab) ? activeTab.replace('lut-', '') : 'apply';

  // Library entries as array
  const lutEntries = Array.from(lutLibrary.entries()).map(([id, entry]) => ({
    id,
    ...entry,
  }));

  // ─── Tab 1: Apply LUT state ───
  const [applySelectedLutId, setApplySelectedLutId] = useState<string>('');
  const [inputR, setInputR] = useState(0.5);
  const [inputG, setInputG] = useState(0.5);
  const [inputB, setInputB] = useState(0.5);
  // RGB link mode: 'none' = independent, 'sync' = same value, 'link' = same delta
  const [rgbLinkMode, setRgbLinkMode] = useState<'none' | 'sync' | 'link'>('none');
  const [rgbAnchor, setRgbAnchor] = useState<[number, number, number]>([0.5, 0.5, 0.5]);
  const [outputRGB, setOutputRGB] = useState<[number, number, number] | null>(null);
  const [applyImage, setApplyImage] = useState<string | null>(null);
  const [applyImageProcessed, setApplyImageProcessed] = useState<string | null>(null);
  const applyCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ─── Tab 2: Generate LUT state ───
  const [srcGamut, setSrcGamut] = useState('sRGB');
  const [srcTF, setSrcTF] = useState<TransferFunctionName>('sRGB');
  const [dstGamut, setDstGamut] = useState('DCI_P3');
  const [dstTF, setDstTF] = useState<TransferFunctionName>('sRGB');
  const [gridSize, setGridSize] = useState(33);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [generatedLUT, setGeneratedLUT] = useState<LUT3D | null>(null);

  // ─── Tab 3: Manage LUT state ───
  const [chainLut1Id, setChainLut1Id] = useState<string>('');
  const [chainLut2Id, setChainLut2Id] = useState<string>('');
  const [manageInfoLutId, setManageInfoLutId] = useState<string>('');
  const [editingLutId, setEditingLutId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // ─── Tab 4: Import LUT state ───
  const [importFormat, setImportFormat] = useState<'cube' | 'csv'>('cube');
  const [cubeText, setCubeText] = useState('');
  const [parsedLUT, setParsedLUT] = useState<LUT3D | null>(null);
  const [parseError, setParseError] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);
  // CSV-specific options
  const [csvOrder, setCsvOrder] = useState<'rgb' | 'bgr'>('rgb');
  const [csvBitDepth, setCsvBitDepth] = useState(12);
  const [csvLineCount, setCsvLineCount] = useState<number | null>(null);
  // Cube data order option (BGR/RGB)
  const [cubeOrder, setCubeOrder] = useState<'bgr' | 'rgb'>('bgr');
  // Import added feedback
  const [importAddedSuccess, setImportAddedSuccess] = useState(false);

  // ─── Tab 5: Export LUT state ───
  const [exportSelectedLutId, setExportSelectedLutId] = useState<string>('');
  const [cubePreview, setCubePreview] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // ─── Feature 3: Bit-depth input mode ───
  type BitDepthMode = 'float' | '8bit' | '10bit';
  const [inputBitDepth, setInputBitDepth] = useState<BitDepthMode>('float');

  // ─── Feature 1: 5³ LUT table ───
  const [showLutTable, setShowLutTable] = useState(false);
  const [lutTable5Data, setLutTable5Data] = useState<LUT3D | null>(null);
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const [editingCellValues, setEditingCellValues] = useState<[number, number, number]>([0, 0, 0]);
  const [activeBSlice, setActiveBSlice] = useState<number>(0);
  const [upsampleSuccess, setUpsampleSuccess] = useState(false);
  const [isUpsampling, setIsUpsampling] = useState(false);
  // B 切片可输入模式: 0~4 整数索引
  const [bSliceInput, setBSliceInput] = useState<string>('0');

  // ─── Feature 2: Gamut adjustment ───
  const [gamutAdjLutId, setGamutAdjLutId] = useState<string>('');
  const [gamutAdjNewGamut, setGamutAdjNewGamut] = useState<string>('DCI_P3');
  const [gamutAdjNewTF, setGamutAdjNewTF] = useState<TransferFunctionName>('sRGB');
  const [gamutAdjResult, setGamutAdjResult] = useState<string>('');
  const [isGamutAdjusting, setIsGamutAdjusting] = useState(false);

  // ─── Generate LUT: name dialog ───
  const [showGenerateNameDialog, setShowGenerateNameDialog] = useState(false);
  const [generateLutName, setGenerateLutName] = useState('');

  // ─── Delete LUT: confirmation dialog ───
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const gamutNames = getGamutNames();
  const tfNames = getTransferFunctionNames();

  // ──────────────────────────────────────────
  // Tab 1: Apply LUT handlers
  // ──────────────────────────────────────────

  // ─── Feature 3: Bit-depth conversion helpers ───
  const bitDepthMax: Record<BitDepthMode, number> = { float: 1, '8bit': 255, '10bit': 1023 };
  const bitDepthStep: Record<BitDepthMode, number> = { float: 0.01, '8bit': 1, '10bit': 1 };
  const bitDepthLabel: Record<BitDepthMode, string> = {
    float: '归一化浮点 (0–1)',
    '8bit': '8-bit 整数 (0–255)',
    '10bit': '10-bit 整数 (0–1023)',
  };

  const toDisplayVal = useCallback((v: number, mode: BitDepthMode) => {
    if (mode === 'float') return parseFloat(v.toFixed(4));
    return Math.round(v * bitDepthMax[mode]);
  }, []);

  const fromInputVal = useCallback((v: number, mode: BitDepthMode) => {
    if (mode === 'float') return clamp(v, 0, 1);
    return clamp(v / bitDepthMax[mode], 0, 1);
  }, []);

  const handleBitDepthChange = useCallback((newMode: BitDepthMode) => {
    setInputBitDepth(newMode);
  }, []);

  const handleApplyRGB = useCallback(() => {
    const entry = lutLibrary.get(applySelectedLutId);
    if (!entry) return;
    const lut = libraryToLUT3D(entry);
    const result = applyLUT3D(lut, inputR, inputG, inputB);
    setOutputRGB(result);
  }, [applySelectedLutId, inputR, inputG, inputB, lutLibrary]);

  const handleApplyImageUpload = useCallback(
    (file: File) => {
      const entry = lutLibrary.get(applySelectedLutId);
      if (!entry) return;
      const lut = libraryToLUT3D(entry);

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setApplyImage(dataUrl);
        setApplyImageProcessed(null);

        const img = new Image();
        img.onload = () => {
          const canvas = applyCanvasRef.current;
          if (!canvas) return;
          // Scale down for performance
          const maxDim = 800;
          const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);

          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const processed = applyLUTToImageData(lut, imageData);
          ctx.putImageData(processed, 0, 0);

          setApplyImageProcessed(canvas.toDataURL('image/png'));
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [applySelectedLutId, lutLibrary]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        handleApplyImageUpload(file);
      }
    },
    [handleApplyImageUpload]
  );

  // ──────────────────────────────────────────
  // Tab 2: Generate LUT handlers
  // ──────────────────────────────────────────

  // Generate a unique LUT name with incremental counter
  const generateUniqueLutName = useCallback((baseName: string) => {
    const existingNames = new Set(Array.from(lutLibrary.values()).map((e) => e.name));
    if (!existingNames.has(baseName)) return baseName;
    let counter = 2;
    while (existingNames.has(`${baseName} #${counter}`)) {
      counter++;
    }
    return `${baseName} #${counter}`;
  }, [lutLibrary]);

  const handleGenerateClick = useCallback(() => {
    // Show name dialog with a suggested name
    const baseName = `${srcGamut} → ${dstGamut}`;
    const uniqueName = generateUniqueLutName(baseName);
    setGenerateLutName(uniqueName);
    setShowGenerateNameDialog(true);
  }, [srcGamut, dstGamut, generateUniqueLutName]);

  const handleGenerateConfirm = useCallback(() => {
    setShowGenerateNameDialog(false);
    setIsGenerating(true);
    setGenerateProgress(0);
    setGeneratedLUT(null);

    const customName = generateLutName.trim() || `${srcGamut} → ${dstGamut}`;

    // Use requestAnimationFrame for progress feedback
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          setGenerateProgress(30);
          const lut = createColorSpaceLUT(gridSize, srcGamut, srcTF, dstGamut, dstTF);
          setGenerateProgress(80);

          // Store in library with custom name
          const id = generateId();
          addLUT(id, {
            name: customName,
            size: lut.size,
            data: lut.data,
            srcGamut: lut.srcGamut,
            dstGamut: lut.dstGamut,
          });

          setGenerateProgress(100);
          setGeneratedLUT({ ...lut, name: customName });

          // Auto-select for apply tab
          setApplySelectedLutId(id);
          setExportSelectedLutId(id);
        } catch (err) {
          console.error('LUT generation error:', err);
        } finally {
          setTimeout(() => {
            setIsGenerating(false);
          }, 300);
        }
      }, 50);
    });
  }, [gridSize, srcGamut, srcTF, dstGamut, dstTF, addLUT, generateLutName]);

  // ──────────────────────────────────────────
  // Tab 4: Manage LUT handlers
  // ──────────────────────────────────────────

  // ─── Feature 1: 5³ LUT table handlers ───
  const handleShowLutTable = useCallback(() => {
    if (!lutTable5Data) {
      const lut5 = createLUT3D(5, '5³ 编辑 LUT');
      setLutTable5Data(lut5);
    }
    setShowLutTable(prev => !prev);
  }, [lutTable5Data]);

  const handleUpsampleLUT = useCallback(() => {
    if (!lutTable5Data || isUpsampling) return;
    setIsUpsampling(true);
    // 使用 requestAnimationFrame 提供点击反馈
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const upsampled = upsampleLUT(lutTable5Data, 17);
          const id = generateId();
          addLUT(id, {
            name: upsampled.name,
            size: upsampled.size,
            data: upsampled.data,
            srcGamut: upsampled.srcGamut,
            dstGamut: upsampled.dstGamut,
          });
          setApplySelectedLutId(id);
          setExportSelectedLutId(id);
          setUpsampleSuccess(true);
          setTimeout(() => setUpsampleSuccess(false), 3000);
        } finally {
          setIsUpsampling(false);
        }
      }, 100);
    });
  }, [lutTable5Data, addLUT, isUpsampling]);

  const handleLutCellClick = useCallback((r: number, g: number, b: number) => {
    const key = `${r}-${g}-${b}`;
    setEditingCellKey(key);
    if (lutTable5Data) {
      const idx = (b * 5 * 5 + g * 5 + r) * 3;
      setEditingCellValues([lutTable5Data.data[idx], lutTable5Data.data[idx + 1], lutTable5Data.data[idx + 2]]);
    }
  }, [lutTable5Data]);

  const handleLutCellSave = useCallback(() => {
    if (!lutTable5Data || !editingCellKey) return;
    const [r, g, b] = editingCellKey.split('-').map(Number);
    const newData = new Float32Array(lutTable5Data.data);
    const idx = (b * 5 * 5 + g * 5 + r) * 3;
    newData[idx] = clamp(editingCellValues[0], 0, 1);
    newData[idx + 1] = clamp(editingCellValues[1], 0, 1);
    newData[idx + 2] = clamp(editingCellValues[2], 0, 1);
    setLutTable5Data({ ...lutTable5Data, data: newData });
    setEditingCellKey(null);
  }, [lutTable5Data, editingCellKey, editingCellValues]);

  // ─── Feature 2: Gamut adjustment handler ───
  const handleGamutAdjust = useCallback(() => {
    const entry = lutLibrary.get(gamutAdjLutId);
    if (!entry || isGamutAdjusting) return;
    setIsGamutAdjusting(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const lut = libraryToLUT3D(entry);
        try {
          const adjusted = adjustLUTGamut(lut, gamutAdjNewGamut, gamutAdjNewTF);
          const id = generateId();
          addLUT(id, {
            name: adjusted.name,
            size: adjusted.size,
            data: adjusted.data,
            srcGamut: adjusted.srcGamut,
            dstGamut: adjusted.dstGamut,
          });
          setManageInfoLutId(id);
          setApplySelectedLutId(id);
          setExportSelectedLutId(id);
          setGamutAdjResult(`色域调整成功: ${lut.dstGamut || 'sRGB'} → ${gamutAdjNewGamut}`);
          setTimeout(() => setGamutAdjResult(''), 4000);
        } catch (err) {
          setGamutAdjResult(`调整失败: ${err instanceof Error ? err.message : '未知错误'}`);
          setTimeout(() => setGamutAdjResult(''), 5000);
        } finally {
          setIsGamutAdjusting(false);
        }
      }, 100);
    });
  }, [gamutAdjLutId, gamutAdjNewGamut, gamutAdjNewTF, lutLibrary, addLUT, isGamutAdjusting]);

  const handleChain = useCallback(() => {
    const entry1 = lutLibrary.get(chainLut1Id);
    const entry2 = lutLibrary.get(chainLut2Id);
    if (!entry1 || !entry2) return;

    const lut1 = libraryToLUT3D(entry1);
    const lut2 = libraryToLUT3D(entry2);

    try {
      const chained = chainLUTs(lut1, lut2, 33);
      const id = generateId();
      addLUT(id, {
        name: chained.name,
        size: chained.size,
        data: chained.data,
        srcGamut: chained.srcGamut,
        dstGamut: chained.dstGamut,
      });
      setManageInfoLutId(id);
      setApplySelectedLutId(id);
      setExportSelectedLutId(id);
    } catch (err) {
      console.error('Chain error:', err);
    }
  }, [chainLut1Id, chainLut2Id, lutLibrary, addLUT]);

  const handleDeleteConfirm = useCallback(
    (id: string) => {
      removeLUT(id);
      if (applySelectedLutId === id) setApplySelectedLutId('');
      if (chainLut1Id === id) setChainLut1Id('');
      if (chainLut2Id === id) setChainLut2Id('');
      if (manageInfoLutId === id) setManageInfoLutId('');
      if (exportSelectedLutId === id) setExportSelectedLutId('');
      setDeleteConfirmId(null);
      setDeleteConfirmName('');
    },
    [removeLUT, applySelectedLutId, chainLut1Id, chainLut2Id, manageInfoLutId, exportSelectedLutId]
  );

  // ──────────────────────────────────────────
  // Tab 4: Import LUT handlers
  // ──────────────────────────────────────────

  const handleParse = useCallback(() => {
    setParseError('');
    setParsedLUT(null);
    try {
      if (importFormat === 'cube') {
        const lut = parseCubeFile(cubeText, cubeOrder);
        setParsedLUT(lut);
      } else {
        const lut = parseCSVLut(cubeText, {
          bitDepth: csvBitDepth,
          order: csvOrder,
        });
        setParsedLUT(lut);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : '解析失败');
    }
  }, [cubeText, importFormat, csvBitDepth, csvOrder, cubeOrder]);

  const handleAddImportedLUT = useCallback(() => {
    if (!parsedLUT) return;
    const id = generateId();
    addLUT(id, {
      name: parsedLUT.name,
      size: parsedLUT.size,
      data: parsedLUT.data,
      srcGamut: parsedLUT.srcGamut,
      dstGamut: parsedLUT.dstGamut,
    });
    setApplySelectedLutId(id);
    setExportSelectedLutId(id);
    // Show success feedback
    setImportAddedSuccess(true);
    setTimeout(() => setImportAddedSuccess(false), 3000);
  }, [parsedLUT, addLUT]);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCubeText(text);
      setParsedLUT(null);
      setParseError('');

      // Auto-detect format from file extension
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'csv') {
        setImportFormat('csv');
        // Count lines for info display
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        setCsvLineCount(lines.length);
        // Auto-detect bit depth from max value
        let maxVal = 0;
        for (const line of lines) {
          const parts = line.split(',').map(Number);
          if (parts.every(p => !isNaN(p))) {
            maxVal = Math.max(maxVal, ...parts);
          }
        }
        if (maxVal > 0) {
          // Find the most likely bit depth
          if (maxVal <= 255) setCsvBitDepth(8);
          else if (maxVal <= 1023) setCsvBitDepth(10);
          else if (maxVal <= 4095) setCsvBitDepth(12);
          else setCsvBitDepth(16);
        }
      } else {
        setImportFormat('cube');
        setCsvLineCount(null);
      }
    };
    reader.readAsText(file);
    // Reset the input so re-selecting the same file works
    e.target.value = '';
  }, []);

  // ──────────────────────────────────────────
  // Tab 6: Export LUT handlers
  // ──────────────────────────────────────────

  useEffect(() => {
    const entry = lutLibrary.get(exportSelectedLutId);
    if (!entry) {
      setCubePreview('');
      return;
    }
    const lut = libraryToLUT3D(entry);
    const cubeStr = exportLUTToCube(lut);
    const lines = cubeStr.split('\n');
    setCubePreview(lines.slice(0, 50).join('\n') + (lines.length > 50 ? '\n...' : ''));
  }, [exportSelectedLutId, lutLibrary]);

  const handleDownload = useCallback(() => {
    const entry = lutLibrary.get(exportSelectedLutId);
    if (!entry) return;
    const lut = libraryToLUT3D(entry);
    const cubeStr = exportLUTToCube(lut);
    const blob = new Blob([cubeStr], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lut.name.replace(/\s+/g, '_')}.cube`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportSelectedLutId, lutLibrary]);

  const handleCopy = useCallback(async () => {
    const entry = lutLibrary.get(exportSelectedLutId);
    if (!entry) return;
    const lut = libraryToLUT3D(entry);
    const cubeStr = exportLUTToCube(lut);
    try {
      await navigator.clipboard.writeText(cubeStr);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = cubeStr;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [exportSelectedLutId, lutLibrary]);

  // ──────────────────────────────────────────
  // Render helpers
  // ──────────────────────────────────────────

  const renderLutSelector = (
    label: string,
    value: string,
    onValueChange: (v: string) => void,
    placeholder = '选择 LUT...'
  ) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {lutEntries.length === 0 && (
            <SelectItem value="__none" disabled>
              库中暂无 LUT
            </SelectItem>
          )}
          {lutEntries.map((entry) => (
            <SelectItem key={entry.id} value={entry.id}>
              {entry.name} ({entry.size}&sup3;)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  // ============ RENDER ============

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">
          <Palette className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">3D LUT 模块</h1>
          <p className="text-sm text-muted-foreground">
            生成、应用、链接、导入和导出 3D 查找表
          </p>
        </div>
      </div>

      <Tabs value={currentTab} onValueChange={(v) => setActiveTab('lut-' + v)} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="apply" className="gap-1.5">
            <Wand2 className="w-4 h-4" />
            <span>LUT 应用</span>
          </TabsTrigger>
          <TabsTrigger value="generate" className="gap-1.5">
            <Play className="w-4 h-4" />
            <span>LUT 生成</span>
          </TabsTrigger>
          <TabsTrigger value="manage" className="gap-1.5">
            <Layers className="w-4 h-4" />
            <span>LUT 管理</span>
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-1.5">
            <FileUp className="w-4 h-4" />
            <span>LUT 导入</span>
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-1.5">
            <FileDown className="w-4 h-4" />
            <span>LUT 导出</span>
          </TabsTrigger>
        </TabsList>

        {/* ============================== */}
        {/* TAB 1: Apply LUT               */}
        {/* ============================== */}
        <TabsContent value="apply">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">应用 LUT 到 RGB 值</CardTitle>
                <CardDescription>选择一个 LUT 并输入 RGB 值，查看变换后的输出。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {renderLutSelector('从库中选择 LUT', applySelectedLutId, setApplySelectedLutId)}

                <Separator />

                {/* Feature 3: Bit-depth mode toggle */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">输入 RGB</Label>
                  <div className="flex gap-1">
                    {(['float', '8bit', '10bit'] as BitDepthMode[]).map((mode) => (
                      <Button
                        key={mode}
                        variant={inputBitDepth === mode ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-2.5 text-[11px] flex-1"
                        onClick={() => handleBitDepthChange(mode)}
                      >
                        {bitDepthLabel[mode]}
                      </Button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">红</Label>
                      <Input
                        type="number"
                        step={bitDepthStep[inputBitDepth]}
                        min={0}
                        max={bitDepthMax[inputBitDepth]}
                        value={toDisplayVal(inputR, inputBitDepth)}
                        onChange={(e) => setInputR(fromInputVal(parseFloat(e.target.value) || 0, inputBitDepth))}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">绿</Label>
                      <Input
                        type="number"
                        step={bitDepthStep[inputBitDepth]}
                        min={0}
                        max={bitDepthMax[inputBitDepth]}
                        value={toDisplayVal(inputG, inputBitDepth)}
                        onChange={(e) => setInputG(fromInputVal(parseFloat(e.target.value) || 0, inputBitDepth))}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">蓝</Label>
                      <Input
                        type="number"
                        step={bitDepthStep[inputBitDepth]}
                        min={0}
                        max={bitDepthMax[inputBitDepth]}
                        value={toDisplayVal(inputB, inputBitDepth)}
                        onChange={(e) => setInputB(fromInputVal(parseFloat(e.target.value) || 0, inputBitDepth))}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">快捷滑块输入</Label>
                    <div className="flex items-center gap-1">
                      <Button
                        variant={rgbLinkMode === 'none' ? 'outline' : 'secondary'}
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => setRgbLinkMode('none')}
                        title="独立模式"
                      >
                        <Unlink className="w-3 h-3" />
                      </Button>
                      <Button
                        variant={rgbLinkMode === 'sync' ? 'default' : 'outline'}
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => {
                          setRgbLinkMode('sync');
                          const avg = (inputR + inputG + inputB) / 3;
                          setInputR(avg);
                          setInputG(avg);
                          setInputB(avg);
                        }}
                        title="同步联动：三通道始终相同值"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>同步</span>
                      </Button>
                      <Button
                        variant={rgbLinkMode === 'link' ? 'default' : 'outline'}
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => {
                          setRgbLinkMode('link');
                          setRgbAnchor([inputR, inputG, inputB]);
                        }}
                        title="联动：拖动任一滑块，其他通道保持差值同步移动"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>联动</span>
                      </Button>
                    </div>
                  </div>
                  {rgbLinkMode === 'link' && (
                    <p className="text-[10px] text-muted-foreground bg-muted/50 rounded px-2 py-1">
                      联动模式：拖动任一滑块，所有通道同步移动相同增量（差值保持不变）
                    </p>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-4 text-red-500 font-medium">R</span>
                      <Slider
                        value={[inputR]}
                        onValueChange={([v]) => {
                          setInputR(v);
                          if (rgbLinkMode === 'sync') {
                            setInputG(v);
                            setInputB(v);
                          } else if (rgbLinkMode === 'link') {
                            const delta = v - rgbAnchor[0];
                            setInputG(clamp(rgbAnchor[1] + delta, 0, 1));
                            setInputB(clamp(rgbAnchor[2] + delta, 0, 1));
                          }
                        }}
                        min={0}
                        max={1}
                        step={0.005}
                        className="flex-1"
                      />
                      <span className="text-xs w-10 text-right text-muted-foreground">
                        {inputR.toFixed(3)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-4 text-green-500 font-medium">G</span>
                      <Slider
                        value={[inputG]}
                        onValueChange={([v]) => {
                          setInputG(v);
                          if (rgbLinkMode === 'sync') {
                            setInputR(v);
                            setInputB(v);
                          } else if (rgbLinkMode === 'link') {
                            const delta = v - rgbAnchor[1];
                            setInputR(clamp(rgbAnchor[0] + delta, 0, 1));
                            setInputB(clamp(rgbAnchor[2] + delta, 0, 1));
                          }
                        }}
                        min={0}
                        max={1}
                        step={0.005}
                        className="flex-1"
                      />
                      <span className="text-xs w-10 text-right text-muted-foreground">
                        {inputG.toFixed(3)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-4 text-blue-500 font-medium">B</span>
                      <Slider
                        value={[inputB]}
                        onValueChange={([v]) => {
                          setInputB(v);
                          if (rgbLinkMode === 'sync') {
                            setInputR(v);
                            setInputG(v);
                          } else if (rgbLinkMode === 'link') {
                            const delta = v - rgbAnchor[2];
                            setInputR(clamp(rgbAnchor[0] + delta, 0, 1));
                            setInputG(clamp(rgbAnchor[1] + delta, 0, 1));
                          }
                        }}
                        min={0}
                        max={1}
                        step={0.005}
                        className="flex-1"
                      />
                      <span className="text-xs w-10 text-right text-muted-foreground">
                        {inputB.toFixed(3)}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleApplyRGB}
                  disabled={!applySelectedLutId || lutEntries.length === 0}
                  className="w-full"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  应用 LUT
                </Button>

                {/* Output results */}
                {outputRGB && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">结果</Label>
                      <div className="flex items-center gap-4 rounded-lg border p-3 bg-muted/30">
                        <div className="flex flex-col items-center gap-1">
                          <div
                            className="w-12 h-12 rounded-md border shadow-sm"
                            style={{
                              backgroundColor: rgbToHex(inputR, inputG, inputB),
                            }}
                          />
                          <span className="text-[10px] text-muted-foreground">输入</span>
                        </div>
                        <span className="text-lg text-muted-foreground">→</span>
                        <div className="flex flex-col items-center gap-1">
                          <div
                            className="w-12 h-12 rounded-md border shadow-sm"
                            style={{
                              backgroundColor: rgbToHex(
                                clamp(outputRGB[0], 0, 1),
                                clamp(outputRGB[1], 0, 1),
                                clamp(outputRGB[2], 0, 1)
                              ),
                            }}
                          />
                          <span className="text-[10px] text-muted-foreground">输出</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-md border p-2 bg-muted/20">
                          <span className="text-xs text-muted-foreground block mb-1">输入 ({bitDepthLabel[inputBitDepth]})</span>
                          <code className="text-xs">
                            R: {toDisplayVal(inputR, inputBitDepth)} G: {toDisplayVal(inputG, inputBitDepth)} B: {toDisplayVal(inputB, inputBitDepth)}
                          </code>
                        </div>
                        <div className="rounded-md border p-2 bg-muted/20">
                          <span className="text-xs text-muted-foreground block mb-1">输出 ({bitDepthLabel[inputBitDepth]})</span>
                          <code className="text-xs">
                            R: {toDisplayVal(clamp(outputRGB[0], 0, 1), inputBitDepth)} G: {toDisplayVal(clamp(outputRGB[1], 0, 1), inputBitDepth)} B: {toDisplayVal(clamp(outputRGB[2], 0, 1), inputBitDepth)}
                          </code>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Right: Image Application */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">应用 LUT 到图片</CardTitle>
                <CardDescription>
                  上传图片以应用所选 LUT，结果将在画布上渲染。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!applySelectedLutId && lutEntries.length === 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    请先生成或导入 LUT。
                  </div>
                )}

                {/* Drag & Drop area */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer ${
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30'
                  }`}
                  onClick={() => {
                    if (!applySelectedLutId) return;
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = 'image/*';
                    fileInput.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleApplyImageUpload(file);
                    };
                    fileInput.click();
                  }}
                >
                  <Upload className="w-8 h-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground text-center">
                    拖放图片到此处，或点击浏览
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    支持 PNG、JPG、WebP 格式
                  </p>
                </div>

                {/* Hidden canvas for image processing */}
                <canvas ref={applyCanvasRef} className="hidden" />

                {/* Image result */}
                {(applyImage || applyImageProcessed) && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {applyImage && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">原图</Label>
                          <div className="rounded-md border overflow-hidden bg-checkered">
                            <img
                              src={applyImage}
                              alt="Original"
                              className="w-full h-auto"
                              style={{ maxHeight: 200, objectFit: 'contain' }}
                            />
                          </div>
                        </div>
                      )}
                      {applyImageProcessed && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">LUT 处理后</Label>
                          <div className="rounded-md border overflow-hidden bg-checkered">
                            <img
                              src={applyImageProcessed}
                              alt="Processed"
                              className="w-full h-auto"
                              style={{ maxHeight: 200, objectFit: 'contain' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Feature 1: 5³ LUT Table Section */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Grid3x3 className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base">5³ LUT 表格查看与编辑</CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={handleShowLutTable}
                >
                  {showLutTable ? '收起' : '展开'}
                </Button>
              </div>
              <CardDescription>
                查看和编辑 5×5×5 LUT 的 125 个条目，可上采样到 17³ 加入库中。
              </CardDescription>
            </CardHeader>
            {showLutTable && lutTable5Data && (
              <CardContent className="space-y-4">
                {/* Upsample button with feedback */}
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleUpsampleLUT}
                    className={`gap-2 transition-all duration-300 ${
                      upsampleSuccess
                        ? 'bg-green-500 hover:bg-green-600 text-white'
                        : ''
                    }`}
                    size="sm"
                    disabled={isUpsampling}
                  >
                    {isUpsampling ? (
                      <>
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        上采样中...
                      </>
                    ) : upsampleSuccess ? (
                      <>
                        <Check className="w-4 h-4" />
                        上采样成功！
                      </>
                    ) : (
                      <>
                        <Expand className="w-4 h-4" />
                        上采样到 17³
                      </>
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    当前: 5³ (125 条目) → 17³ (4,913 条目)
                  </span>
                </div>
                {upsampleSuccess && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg text-xs bg-green-50 border border-green-200 text-green-700 animate-in fade-in duration-300">
                    <Check className="w-4 h-4 flex-shrink-0" />
                    上采样完成！17³ LUT 已添加到库中，可在"应用"和"导出"选项卡中使用。
                  </div>
                )}

                {/* Cell editor modal */}
                {editingCellKey && (
                  <div className="rounded-lg border border-primary bg-primary/5 p-4 space-y-3">
                    <Label className="text-sm font-medium">
                      编辑单元格 ({editingCellKey.split('-').map(Number).join(', ')})
                    </Label>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-red-500">R</Label>
                        <Input
                          type="number" step={0.01} min={0} max={1}
                          value={editingCellValues[0]}
                          onChange={(e) => setEditingCellValues([parseFloat(e.target.value) || 0, editingCellValues[1], editingCellValues[2]])}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-green-500">G</Label>
                        <Input
                          type="number" step={0.01} min={0} max={1}
                          value={editingCellValues[1]}
                          onChange={(e) => setEditingCellValues([editingCellValues[0], parseFloat(e.target.value) || 0, editingCellValues[2]])}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-blue-500">B</Label>
                        <Input
                          type="number" step={0.01} min={0} max={1}
                          value={editingCellValues[2]}
                          onChange={(e) => setEditingCellValues([editingCellValues[0], editingCellValues[1], parseFloat(e.target.value) || 0])}
                          className="h-8"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleLutCellSave} className="gap-1">
                        <Check className="w-3.5 h-3.5" />
                        保存
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingCellKey(null)}>
                        取消
                      </Button>
                    </div>
                  </div>
                )}

                {/* B-slice selector */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">B 切片（行 = R, 列 = G）</Label>
                  </div>
                  <div className="flex gap-1.5">
                    {Array.from({ length: 5 }, (_, b) => (
                      <Button
                        key={b}
                        variant={activeBSlice === b ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 px-3 text-xs flex-1"
                        onClick={() => {
                          setActiveBSlice(b);
                        }}
                      >
                        B={(b / 4).toFixed(2)}
                      </Button>
                    ))}
                  </div>

                  {/* Scrollable table area */}
                  <ScrollArea className="max-h-96 w-full rounded-md border">
                    <div className="p-2 space-y-1.5">
                      {/* Current slice info */}
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          B = {(activeBSlice / 4).toFixed(2)}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          (第 {activeBSlice + 1}/5 切片)
                        </span>
                      </div>
                      {/* Column headers (G values) */}
                      <div className="flex gap-0.5">
                        <div className="w-12 flex-shrink-0" />
                        {Array.from({ length: 5 }, (_, g) => (
                          <div key={g} className="flex-1 text-center text-[10px] text-muted-foreground font-medium">
                            G={(g / 4).toFixed(2)}
                          </div>
                        ))}
                      </div>
                      {/* Rows (R values) for current B slice */}
                      {Array.from({ length: 5 }, (_, r) => {
                        const rVal = r / 4;
                        const bVal = activeBSlice / 4;
                        return (
                          <div key={r} className="flex gap-0.5">
                            <div className="w-12 flex-shrink-0 text-[10px] text-muted-foreground flex items-center justify-end pr-1">
                              R={rVal.toFixed(2)}
                            </div>
                            {Array.from({ length: 5 }, (_, g) => {
                              const gVal = g / 4;
                              const idx = (activeBSlice * 5 * 5 + g * 5 + r) * 3;
                              const or = lutTable5Data.data[idx];
                              const og = lutTable5Data.data[idx + 1];
                              const ob = lutTable5Data.data[idx + 2];
                              const cellKey = `${r}-${g}-${activeBSlice}`;
                              const isEditing = editingCellKey === cellKey;
                              const cr = clamp(Math.round(clamp(or, 0, 1) * 255), 0, 255);
                              const cg = clamp(Math.round(clamp(og, 0, 1) * 255), 0, 255);
                              const cb = clamp(Math.round(clamp(ob, 0, 1) * 255), 0, 255);
                              return (
                                <button
                                  key={g}
                                  className={`flex-1 h-10 rounded border text-[8px] leading-tight p-0.5 transition-colors cursor-pointer hover:ring-1 hover:ring-primary ${isEditing ? 'ring-2 ring-primary' : ''}`}
                                  style={{
                                    backgroundColor: `rgb(${cr},${cg},${cb})`,
                                    color: (cr * 0.299 + cg * 0.587 + cb * 0.114) > 128 ? '#000' : '#fff',
                                  }}
                                  onClick={() => handleLutCellClick(r, g, activeBSlice)}
                                  title={`输入: (${rVal.toFixed(2)}, ${gVal.toFixed(2)}, ${bVal.toFixed(2)})\n输出: (${or.toFixed(4)}, ${og.toFixed(4)}, ${ob.toFixed(4)})`}
                                >
                                  <span className="block">{or.toFixed(2)}</span>
                                  <span className="block">{og.toFixed(2)}</span>
                                  <span className="block">{ob.toFixed(2)}</span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            )}
          </Card>
        </TabsContent>

        {/* ============================== */}
        {/* TAB 2: Generate LUT            */}
        {/* ============================== */}
        <TabsContent value="generate">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">生成 3D LUT</CardTitle>
                <CardDescription>
                  从色彩空间转换创建 3D LUT。选择源和目标色域及传输函数。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Source */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      源
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">色域</Label>
                      <Select value={srcGamut} onValueChange={setSrcGamut}>
                        <SelectTrigger className="w-full h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {gamutNames.map((g) => (
                            <SelectItem key={g} value={g}>
                              {g}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">传输函数</Label>
                      <Select value={srcTF} onValueChange={(v) => setSrcTF(v as TransferFunctionName)}>
                        <SelectTrigger className="w-full h-9">
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
                  </div>
                </div>

                <Separator />

                {/* Target */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      目标
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">色域</Label>
                      <Select value={dstGamut} onValueChange={setDstGamut}>
                        <SelectTrigger className="w-full h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {gamutNames.map((g) => (
                            <SelectItem key={g} value={g}>
                              {g}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">传输函数</Label>
                      <Select value={dstTF} onValueChange={(v) => setDstTF(v as TransferFunctionName)}>
                        <SelectTrigger className="w-full h-9">
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
                  </div>
                </div>

                <Separator />

                {/* Grid size */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">网格大小</Label>
                  <Select value={String(gridSize)} onValueChange={(v) => setGridSize(Number(v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="17">17 &times; 17 &times; 17 (4,913 条目)</SelectItem>
                      <SelectItem value="33">33 &times; 33 &times; 33 (35,937 条目)</SelectItem>
                      <SelectItem value="65">65 &times; 65 &times; 65 (274,625 条目)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Progress */}
                {isGenerating && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>正在生成...</span>
                      <span>{generateProgress}%</span>
                    </div>
                    <Progress value={generateProgress} className="h-2" />
                  </div>
                )}

                <Button onClick={handleGenerateClick} disabled={isGenerating} className="w-full">
                  <Play className="w-4 h-4 mr-2" />
                  {isGenerating ? '正在生成...' : '生成 LUT'}
                </Button>
              </CardContent>
            </Card>

            {/* Right: Generated LUT Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">生成结果</CardTitle>
                <CardDescription>已生成 LUT 的信息。</CardDescription>
              </CardHeader>
              <CardContent>
                {!generatedLUT && !isGenerating && (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <ImageIcon className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">配置转换参数后点击生成。</p>
                  </div>
                )}

                {generatedLUT && (
                  <div className="space-y-4">
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500" />
                        <span className="text-sm font-medium">LUT 生成成功</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-xs text-muted-foreground block">名称</span>
                          <span className="font-medium">{generatedLUT.name}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">网格大小</span>
                          <span className="font-medium">
                            {generatedLUT.size} &times; {generatedLUT.size} &times; {generatedLUT.size}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">总条目数</span>
                          <span className="font-medium">
                            {(generatedLUT.size ** 3).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">数据大小</span>
                          <span className="font-medium">
                            {((generatedLUT.data.byteLength / 1024).toFixed(1))} KB
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">源</span>
                          <Badge variant="secondary" className="text-xs">
                            {srcGamut} / {srcTF}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">目标</span>
                          <Badge variant="secondary" className="text-xs">
                            {dstGamut} / {dstTF}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-3">
                      <strong>已添加到库中。</strong>现在可以在应用、管理和导出选项卡中使用此 LUT。
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============================== */}
        {/* TAB 3: Manage LUTs             */}
        {/* ============================== */}
        <TabsContent value="manage">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LUT Library List */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">LUT 库</CardTitle>
                <CardDescription>
                  点击 LUT 项查看详情与色域调整，再次点击取消选择。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {lutEntries.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                    <Layers className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">库中暂无 LUT。</p>
                    <p className="text-xs mt-1">请先生成或导入 LUT。</p>
                  </div>
                )}

                {lutEntries.length > 0 && (
                  <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                    {lutEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`flex items-center justify-between rounded-lg border p-3 transition-colors cursor-pointer select-none ${
                          manageInfoLutId === entry.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
                        }`}
                        onClick={() => {
                          // Toggle: click again to deselect and hide gamut adjustment
                          if (manageInfoLutId === entry.id) {
                            setManageInfoLutId('');
                          } else {
                            setManageInfoLutId(entry.id);
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingLutId(entry.id);
                          setEditingName(entry.name);
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />
                          <div className="min-w-0">
                            {editingLutId === entry.id ? (
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onBlur={() => {
                                  const trimmed = editingName.trim();
                                  if (trimmed && trimmed !== entry.name) {
                                    renameLUT(entry.id, trimmed);
                                  }
                                  setEditingLutId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const trimmed = editingName.trim();
                                    if (trimmed && trimmed !== entry.name) {
                                      renameLUT(entry.id, trimmed);
                                    }
                                    setEditingLutId(null);
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingLutId(null);
                                  }
                                }}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                className="text-sm font-medium bg-muted border rounded px-1.5 py-0.5 w-full max-w-[200px] focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            ) : (
                              <p className="text-sm font-medium truncate">{entry.name}</p>
                            )}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {entry.size}&sup3;
                              </Badge>
                              {entry.srcGamut && <span>{entry.srcGamut}</span>}
                              {entry.srcGamut && entry.dstGamut && <span>&rarr;</span>}
                              {entry.dstGamut && <span>{entry.dstGamut}</span>}
                            </div>
                            {entry.createdAt && (
                              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                                {new Date(entry.createdAt).toLocaleString('zh-CN', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setEditingLutId(entry.id);
                              setEditingName(entry.name);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive h-8 w-8 p-0"
                            onClick={() => {
                              setDeleteConfirmId(entry.id);
                              setDeleteConfirmName(entry.name);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Feature 2: Gamut Adjustment — only shown when a LUT is selected */}
                {manageInfoLutId && lutLibrary.get(manageInfoLutId) && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <ArrowRight className="w-4 h-4 text-violet-500" />
                        色域调整
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        将选中 LUT「{lutLibrary.get(manageInfoLutId)?.name}」的输出色域重新映射到目标色域，生成一个新的 LUT。
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">新目标色域</Label>
                          <Select value={gamutAdjNewGamut} onValueChange={setGamutAdjNewGamut}>
                            <SelectTrigger className="w-full h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {gamutNames.map((g) => (
                                <SelectItem key={g} value={g}>
                                  {g}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">新传输函数</Label>
                          <Select value={gamutAdjNewTF} onValueChange={(v) => setGamutAdjNewTF(v as TransferFunctionName)}>
                            <SelectTrigger className="w-full h-9">
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
                      </div>
                      <Button
                        onClick={() => {
                          if (isGamutAdjusting) return;
                          setIsGamutAdjusting(true);
                          const srcId = manageInfoLutId;
                          const entry = lutLibrary.get(srcId);
                          if (!entry) { setIsGamutAdjusting(false); return; }
                          const lut = libraryToLUT3D(entry);
                          requestAnimationFrame(() => {
                            setTimeout(() => {
                              try {
                                const adjusted = adjustLUTGamut(lut, gamutAdjNewGamut, gamutAdjNewTF);
                                const id = generateId();
                                addLUT(id, {
                                  name: adjusted.name,
                                  size: adjusted.size,
                                  data: adjusted.data,
                                  srcGamut: adjusted.srcGamut,
                                  dstGamut: adjusted.dstGamut,
                                });
                                setManageInfoLutId(id);
                                setApplySelectedLutId(id);
                                setExportSelectedLutId(id);
                                setGamutAdjResult(`色域调整成功: ${lut.dstGamut || 'sRGB'} → ${gamutAdjNewGamut}`);
                                setTimeout(() => setGamutAdjResult(''), 4000);
                              } catch (err) {
                                setGamutAdjResult(`调整失败: ${err instanceof Error ? err.message : '未知错误'}`);
                                setTimeout(() => setGamutAdjResult(''), 5000);
                              } finally {
                                setIsGamutAdjusting(false);
                              }
                            }, 100);
                          });
                        }}
                        disabled={isGamutAdjusting}
                        className="w-full gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-md transition-all duration-300"
                      >
                        {isGamutAdjusting ? (
                          <>
                            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            调整中...
                          </>
                        ) : (
                          <>
                            <ArrowRight className="w-4 h-4" />
                            调整色域
                          </>
                        )}
                      </Button>
                      {gamutAdjResult && (
                        <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs animate-in fade-in duration-300 ${
                          gamutAdjResult.startsWith('色域调整成功')
                            ? 'bg-green-50 border border-green-200 text-green-700'
                            : 'bg-destructive/10 border border-destructive/20 text-destructive'
                        }`}>
                          {gamutAdjResult.startsWith('色域调整成功')
                            ? <Check className="w-4 h-4 flex-shrink-0" />
                            : <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          }
                          {gamutAdjResult}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Right sidebar: Chain LUT (top) + LUT Details (bottom) */}
            <div className="flex flex-col gap-6">
              {/* Top: 链接 LUT */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    链接 LUT
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {lutEntries.length < 2 && (
                    <div className="text-center text-muted-foreground py-4">
                      <p className="text-sm">需要至少 2 个 LUT 才能链接。</p>
                    </div>
                  )}
                  {lutEntries.length >= 2 && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        先应用 LUT1，再应用 LUT2，创建组合 LUT。
                      </p>
                      <div className="space-y-2">
                        {renderLutSelector('LUT 1', chainLut1Id, setChainLut1Id)}
                        {renderLutSelector('LUT 2', chainLut2Id, setChainLut2Id)}
                      </div>
                      <Button
                        onClick={handleChain}
                        disabled={!chainLut1Id || !chainLut2Id || chainLut1Id === chainLut2Id}
                        variant="secondary"
                        className="w-full"
                      >
                        <Link2 className="w-4 h-4 mr-2" />
                        链接 LUT
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Bottom: LUT 详情 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    LUT 详情
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!manageInfoLutId && (
                    <div className="text-center text-muted-foreground py-8">
                      <p className="text-sm">点击左侧 LUT 查看详情。</p>
                    </div>
                  )}

                  {manageInfoLutId && lutLibrary.get(manageInfoLutId) && (
                    (() => {
                      const entry = lutLibrary.get(manageInfoLutId)!;
                      return (
                        <div className="space-y-3">
                          <div className="rounded-lg border p-3 space-y-2.5">
                            <div>
                              <span className="text-xs text-muted-foreground block">名称</span>
                              <span className="text-sm font-medium">{entry.name}</span>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground block">网格大小</span>
                              <span className="text-sm">{entry.size} &times; {entry.size} &times; {entry.size}</span>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground block">总条目数</span>
                              <span className="text-sm">{(entry.size ** 3).toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground block">内存</span>
                              <span className="text-sm">{(entry.data.byteLength / 1024).toFixed(1)} KB</span>
                            </div>
                            {entry.srcGamut && (
                              <div>
                                <span className="text-xs text-muted-foreground block">源色域</span>
                                <Badge variant="outline" className="text-xs">{entry.srcGamut}</Badge>
                              </div>
                            )}
                            {entry.dstGamut && (
                              <div>
                                <span className="text-xs text-muted-foreground block">目标色域</span>
                                <Badge variant="outline" className="text-xs">{entry.dstGamut}</Badge>
                              </div>
                            )}
                          </div>

                          <Separator />

                          {/* Color sample: identity vs applied */}
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">颜色采样</Label>
                            <div className="grid grid-cols-4 gap-1.5">
                              {[
                                [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1],
                                [0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5], [0.5, 0.5, 0.5],
                              ].map(([r, g, b], i) => {
                                const lut = libraryToLUT3D(entry);
                                const [or, og, ob] = applyLUT3D(lut, r, g, b);
                                return (
                                  <div key={i} className="flex flex-col items-center gap-0.5">
                                    <div
                                      className="w-8 h-8 rounded border"
                                      style={{
                                        backgroundColor: rgbToHex(
                                          clamp(or, 0, 1),
                                          clamp(og, 0, 1),
                                          clamp(ob, 0, 1)
                                        ),
                                      }}
                                      title={`输入: (${r}, ${g}, ${b}) → 输出: (${or.toFixed(3)}, ${og.toFixed(3)}, ${ob.toFixed(3)})`}
                                    />
                                    <span className="text-[9px] text-muted-foreground">
                                      {r},{g},{b}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ============================== */}
        {/* TAB 4: Import LUT              */}
        {/* ============================== */}
        <TabsContent value="import">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">导入 3D LUT</CardTitle>
                <CardDescription>
                  支持 .cube 和 .csv 两种格式。CSV 格式为逗号分隔的 RGB 整数值，需指定位深和排列顺序。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Format selector */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">文件格式</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={importFormat === 'cube' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setImportFormat('cube');
                        setParsedLUT(null);
                        setParseError('');
                      }}
                      className="gap-1.5"
                    >
                      .cube 格式
                    </Button>
                    <Button
                      variant={importFormat === 'csv' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setImportFormat('csv');
                        setParsedLUT(null);
                        setParseError('');
                      }}
                      className="gap-1.5"
                    >
                      .csv 格式
                    </Button>
                  </div>
                </div>

                {/* CSV-specific options */}
                {importFormat === 'csv' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
                      <AlertCircle className="w-4 h-4" />
                      CSV 导入选项
                    </div>

                    {/* Bit depth */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">位深</Label>
                      <Select value={String(csvBitDepth)} onValueChange={(v) => setCsvBitDepth(Number(v))}>
                        <SelectTrigger className="w-full h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="8">8-bit (0 – 255)</SelectItem>
                          <SelectItem value="10">10-bit (0 – 1023)</SelectItem>
                          <SelectItem value="12">12-bit (0 – 4095)</SelectItem>
                          <SelectItem value="14">14-bit (0 – 16383)</SelectItem>
                          <SelectItem value="16">16-bit (0 – 65535)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        CSV 中的整数值将除以 {(Math.pow(2, csvBitDepth) - 1)} 归一化到 0 – 1
                      </p>
                    </div>

                    {/* Data order */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">数据排列顺序</Label>
                      <Select value={csvOrder} onValueChange={(v) => setCsvOrder(v as 'rgb' | 'bgr')}>
                        <SelectTrigger className="w-full h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rgb">RGB 递增 (R 外层 → G 中层 → B 内层)</SelectItem>
                          <SelectItem value="bgr">BGR 递增 (B 外层 → G 中层 → R 内层)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        {csvOrder === 'rgb'
                          ? 'RGB 递增: R 值变化最慢（外层循环），B 值变化最快（内层循环）'
                          : 'BGR 递增: B 值变化最慢（外层循环），R 值变化最快（内层循环）'}
                      </p>
                    </div>

                    {/* CSV line count info */}
                    {csvLineCount !== null && (
                      <div className="text-xs bg-white/60 rounded-md p-2 border border-amber-100">
                        <span className="text-muted-foreground">已加载数据行数: </span>
                        <span className="font-medium">{csvLineCount.toLocaleString()}</span>
                        <span className="text-muted-foreground"> | 自动检测网格: </span>
                        <span className="font-medium">{Math.round(Math.cbrt(csvLineCount))}³</span>
                        {Math.pow(Math.round(Math.cbrt(csvLineCount)), 3) === csvLineCount ? (
                          <span className="text-green-600 ml-1">✓ 有效</span>
                        ) : (
                          <span className="text-red-500 ml-1">✗ 不是完全立方数</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Cube-specific options */}
                {importFormat === 'cube' && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
                      <AlertCircle className="w-4 h-4" />
                      .cube 导入选项
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">数据遍历顺序</Label>
                      <Select value={cubeOrder} onValueChange={(v) => setCubeOrder(v as 'bgr' | 'rgb')}>
                        <SelectTrigger className="w-full h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bgr">BGR 递增 (B 外层 → G 中层 → R 内层) — 标准 .cube</SelectItem>
                          <SelectItem value="rgb">RGB 递增 (R 外层 → G 中层 → B 内层)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        {cubeOrder === 'bgr'
                          ? '标准 .cube 格式，B 值变化最慢（外层），R 值变化最快（内层）'
                          : 'RGB 格式，R 值变化最慢（外层），B 值变化最快（内层），导入时自动重排'}
                      </p>
                    </div>
                  </div>
                )}

                <Separator />

                {/* File upload button */}
                <div className="flex items-center gap-3">
                  <input
                    ref={importFileRef}
                    type="file"
                    accept={importFormat === 'csv' ? '.csv' : '.cube'}
                    className="hidden"
                    onChange={handleImportFile}
                  />
                  <Button
                    variant="outline"
                    onClick={() => importFileRef.current?.click()}
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    上传 {importFormat === 'csv' ? '.csv' : '.cube'} 文件
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    或在下方粘贴内容
                  </span>
                </div>

                <Textarea
                  value={cubeText}
                  onChange={(e) => {
                    setCubeText(e.target.value);
                    setParsedLUT(null);
                    setParseError('');
                    // Count CSV lines when typing
                    if (importFormat === 'csv' && e.target.value) {
                      const lines = e.target.value.split('\n').filter(l => l.trim().length > 0);
                      setCsvLineCount(lines.length);
                    } else {
                      setCsvLineCount(null);
                    }
                  }}
                  placeholder={
                    importFormat === 'cube'
                      ? `TITLE "My LUT"\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\nLUT_3D_SIZE 33\n\n0.000000 0.000000 0.000000\n...`
                      : `0,0,0\n86,77,0\n310,191,131\n...\n(每行 3 个逗号分隔的整数值)`
                  }
                  className="font-mono text-xs min-h-[200px] max-h-96"
                />

                <Button
                  onClick={handleParse}
                  disabled={!cubeText.trim()}
                  className="w-full"
                >
                  <FileUp className="w-4 h-4 mr-2" />
                  解析 {importFormat === 'csv' ? 'CSV' : '.cube'} 内容
                </Button>

                {parseError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {parseError}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Parsed LUT info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">已解析 LUT 信息</CardTitle>
                <CardDescription>
                  {importFormat === 'csv'
                    ? `CSV 格式 | ${csvOrder.toUpperCase()} 递增 | ${csvBitDepth}-bit`
                    : '.cube 格式'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!parsedLUT && !parseError && (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <FileUp className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">尚未解析 LUT。</p>
                  </div>
                )}

                {parsedLUT && (
                  <div className="space-y-4">
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500" />
                        <span className="text-sm font-medium">解析成功</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-xs text-muted-foreground block">名称</span>
                          <span className="font-medium">{parsedLUT.name}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">大小</span>
                          <span className="font-medium">{parsedLUT.size} &times; {parsedLUT.size} &times; {parsedLUT.size}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">域最小值</span>
                          <span className="font-medium">
                            {parsedLUT.inputRange.min} {parsedLUT.inputRange.min} {parsedLUT.inputRange.min}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">域最大值</span>
                          <span className="font-medium">
                            {parsedLUT.inputRange.max} {parsedLUT.inputRange.max} {parsedLUT.inputRange.max}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">总条目数</span>
                          <span className="font-medium">
                            {(parsedLUT.size ** 3).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">内存</span>
                          <span className="font-medium">
                            {(parsedLUT.data.byteLength / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Reorder verification — show sample lookups vs raw CSV values */}
                    {importFormat === 'csv' && (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-green-500" />
                          重排验证（输入网格点 → applyLUT3D 查找结果）
                        </Label>
                        <div className="rounded-md border bg-muted/20 p-3 max-h-48 overflow-y-auto">
                          <table className="text-[11px] font-mono w-full">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left pr-3 font-normal">输入 (R,G,B)</th>
                                <th className="text-left pr-3 font-normal">归一化</th>
                                <th className="text-left font-normal">applyLUT3D 输出</th>
                              </tr>
                            </thead>
                            <tbody className="text-muted-foreground">
                              {(() => {
                                const size = parsedLUT.size;
                                // Sample specific grid points: corners, midpoints, and some from CSV
                                const samples: [number, number, number][] = [
                                  [0, 0, 0],
                                  [size - 1, 0, 0],
                                  [0, size - 1, 0],
                                  [0, 0, size - 1],
                                  [size - 1, size - 1, size - 1],
                                  [Math.floor(size / 2), Math.floor(size / 2), Math.floor(size / 2)],
                                ];
                                return samples.map(([ri, gi, bi]) => {
                                  const normR = ri / (size - 1);
                                  const normG = gi / (size - 1);
                                  const normB = bi / (size - 1);
                                  const [or, og, ob] = applyLUT3D(parsedLUT, normR, normG, normB);
                                  return (
                                    <tr key={`${ri}-${gi}-${bi}`} className="border-t border-muted/30">
                                      <td className="py-1 pr-3">({ri},{gi},{bi})</td>
                                      <td className="py-1 pr-3">({normR.toFixed(4)},{normG.toFixed(4)},{normB.toFixed(4)})</td>
                                      <td className="py-1">({or.toFixed(4)},{og.toFixed(4)},{ob.toFixed(4)})</td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Data preview (internal format, first entries) */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">内部数据预览（前10条，B-outer 排列）</Label>
                      <div className="rounded-md border bg-muted/20 p-3 max-h-32 overflow-y-auto">
                        <pre className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                          {Array.from({ length: Math.min(10, parsedLUT.size ** 3) })
                            .map((_, i) => {
                              const idx = i * 3;
                              const size = parsedLUT.size;
                              // Decode back to grid point
                              const b = Math.floor(i / (size * size));
                              const g = Math.floor((i % (size * size)) / size);
                              const r = i % size;
                              return `[${r},${g},${b}] → ${parsedLUT.data[idx]?.toFixed(6) ?? '-'} ${parsedLUT.data[idx + 1]?.toFixed(6) ?? '-'} ${parsedLUT.data[idx + 2]?.toFixed(6) ?? '-'}`;
                            })
                            .join('\n')}
                        </pre>
                      </div>
                    </div>

                    <Button onClick={handleAddImportedLUT} className="w-full" disabled={importAddedSuccess}>
                      {importAddedSuccess ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          已成功添加到库中
                        </>
                      ) : (
                        <>
                          <Layers className="w-4 h-4 mr-2" />
                          添加到库中
                        </>
                      )}
                    </Button>
                    {importAddedSuccess && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs animate-in fade-in duration-300">
                        <Check className="w-4 h-4 flex-shrink-0" />
                        LUT 已成功入库，可前往"应用"或"导出"选项卡使用。
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============================== */}
        {/* TAB 5: Export LUT              */}
        {/* ============================== */}
        <TabsContent value="export">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">导出 .cube 文件</CardTitle>
                <CardDescription>
                  从库中选择一个 LUT 以 .cube 格式导出。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderLutSelector('要导出的 LUT', exportSelectedLutId, setExportSelectedLutId)}

                {exportSelectedLutId && lutLibrary.get(exportSelectedLutId) && (
                  (() => {
                    const entry = lutLibrary.get(exportSelectedLutId)!;
                    return (
                      <div className="rounded-lg border p-4 space-y-2">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-xs text-muted-foreground block">名称</span>
                            <span className="font-medium">{entry.name}</span>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground block">大小</span>
                            <span className="font-medium">{entry.size}&sup3; ({(entry.size ** 3).toLocaleString()} 条目)</span>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground block">源</span>
                            <Badge variant="secondary" className="text-xs">
                              {entry.srcGamut || 'N/A'}
                            </Badge>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground block">目标</span>
                            <Badge variant="secondary" className="text-xs">
                              {entry.dstGamut || 'N/A'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={handleDownload}
                    disabled={!exportSelectedLutId}
                    className="flex-1 gap-2"
                  >
                    <Download className="w-4 h-4" />
                    下载 .cube
                  </Button>
                  <Button
                    onClick={handleCopy}
                    disabled={!exportSelectedLutId}
                    variant="secondary"
                    className="flex-1 gap-2"
                  >
                    {copySuccess ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    {copySuccess ? '已复制！' : '复制到剪贴板'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">.cube 文件预览</CardTitle>
                <CardDescription>导出的 .cube 文件前 50 行。</CardDescription>
              </CardHeader>
              <CardContent>
                {!cubePreview && (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <FileDown className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">选择一个 LUT 以预览导出内容。</p>
                  </div>
                )}

                {cubePreview && (
                  <div className="rounded-md border bg-muted/20 p-3 max-h-96 overflow-y-auto">
                    <pre className="text-[11px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-all">
                      {cubePreview}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Generate LUT: Name Dialog */}
      <Dialog open={showGenerateNameDialog} onOpenChange={setShowGenerateNameDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>生成 LUT</DialogTitle>
            <DialogDescription>
              为即将生成的 LUT 命名。你可以修改名称或使用建议的默认值。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">LUT 名称</Label>
            <Input
              value={generateLutName}
              onChange={(e) => setGenerateLutName(e.target.value)}
              placeholder="输入 LUT 名称"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleGenerateConfirm();
                }
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              配置：{srcGamut} → {dstGamut} | {gridSize}³ | {srcTF} / {dstTF}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateNameDialog(false)}>
              取消
            </Button>
            <Button onClick={handleGenerateConfirm} disabled={!generateLutName.trim()}>
              确认生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete LUT: Confirmation Dialog */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) { setDeleteConfirmId(null); setDeleteConfirmName(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 LUT「{deleteConfirmName}」吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmId && handleDeleteConfirm(deleteConfirmId)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
