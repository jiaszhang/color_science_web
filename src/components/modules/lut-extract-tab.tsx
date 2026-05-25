'use client';

import { useState, useRef, useCallback } from 'react';
import {
  extractLUTFromColorPairs,
  generateCalibrationImageData,
  renderCalibrationImage,
  extractLUTFromCalibrationPair,
  computeColorCoverage,
  type LUT3D,
} from '@/lib/color-science/lut3d';
import { useAppStore } from '@/lib/store/app-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  Upload,
  Plus,
  Trash2,
  Download,
  ImageIcon,
  ArrowRight,
  Check,
  Loader2,
  Image as ImageLucide,
} from 'lucide-react';

// ============ Types ============

interface ImagePair {
  id: string;
  inputSrc: string | null;
  outputSrc: string | null;
  inputName: string;
  outputName: string;
}

interface ExtractionResult {
  lut: LUT3D;
  coverage: { ratio: number; covered: number; total: number };
}

// ============ Helpers ============

function generateId(): string {
  return `pair_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function loadImageToCanvas(src: string): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Limit size for performance
      const maxDim = 1024;
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ canvas, ctx });
    };
    img.onerror = reject;
    img.src = src;
  });
}

function sampleImagePixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: 'low' | 'medium' | 'high'
): Array<[number, number, number]> {
  const step = density === 'low' ? 8 : density === 'medium' ? 4 : 2;
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels: Array<[number, number, number]> = [];

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      pixels.push([
        imageData.data[idx] / 255,
        imageData.data[idx + 1] / 255,
        imageData.data[idx + 2] / 255,
      ]);
    }
  }

  return pixels;
}

// ============ Image Drop Zone ============

function ImageDropZone({
  label,
  imageSrc,
  imageName,
  onImageLoad,
}: {
  label: string;
  imageSrc: string | null;
  imageName: string;
  onImageLoad: (src: string, name: string) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        onImageLoad(e.target?.result as string, file.name);
      };
      reader.readAsDataURL(file);
    },
    [onImageLoad]
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
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        {imageSrc ? (
          <div className="space-y-1.5">
            <img
              src={imageSrc}
              alt={imageName}
              className="w-full h-24 object-cover rounded"
            />
            <p className="text-xs text-muted-foreground truncate">{imageName}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="w-6 h-6" />
            <p className="text-xs">拖拽或点击上传</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Section 1: Image Pair Extraction ============

function ImagePairExtraction() {
  const { addLUT } = useAppStore();

  const [pairs, setPairs] = useState<ImagePair[]>([
    { id: generateId(), inputSrc: null, outputSrc: null, inputName: '', outputName: '' },
  ]);
  const [gridSize, setGridSize] = useState(17);
  const [samplingDensity, setSamplingDensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [idwPower, setIdwPower] = useState(2);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [addedToLib, setAddedToLib] = useState(false);

  const addPair = useCallback(() => {
    setPairs((prev) => [
      ...prev,
      { id: generateId(), inputSrc: null, outputSrc: null, inputName: '', outputName: '' },
    ]);
  }, []);

  const removePair = useCallback((id: string) => {
    setPairs((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updatePair = useCallback(
    (id: string, field: 'inputSrc' | 'outputSrc' | 'inputName' | 'outputName', value: string) => {
      setPairs((prev) =>
        prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
      );
    },
    []
  );

  const handleExtract = useCallback(async () => {
    const validPairs = pairs.filter((p) => p.inputSrc && p.outputSrc);
    if (validPairs.length === 0) return;

    setIsExtracting(true);
    setProgress(0);
    setResult(null);
    setAddedToLib(false);

    try {
      const allColorPairs: Array<{ input: [number, number, number]; output: [number, number, number] }> = [];

      for (let i = 0; i < validPairs.length; i++) {
        const pair = validPairs[i];

        const inputResult = await loadImageToCanvas(pair.inputSrc!);
        const inputPixels = sampleImagePixels(
          inputResult.ctx,
          inputResult.canvas.width,
          inputResult.canvas.height,
          samplingDensity
        );

        const outputResult = await loadImageToCanvas(pair.outputSrc!);
        const outputPixels = sampleImagePixels(
          outputResult.ctx,
          outputResult.canvas.width,
          outputResult.canvas.height,
          samplingDensity
        );

        const minLen = Math.min(inputPixels.length, outputPixels.length);
        for (let j = 0; j < minLen; j++) {
          allColorPairs.push({
            input: inputPixels[j],
            output: outputPixels[j],
          });
        }

        setProgress(((i + 1) / validPairs.length) * 50);
      }

      setProgress(60);

      const lut = extractLUTFromColorPairs(allColorPairs, gridSize, idwPower);
      setProgress(85);

      const coverage = computeColorCoverage(allColorPairs, gridSize);
      setProgress(100);

      setResult({ lut, coverage });
    } catch (err) {
      console.error('Extraction error:', err);
    } finally {
      setTimeout(() => setIsExtracting(false), 300);
    }
  }, [pairs, gridSize, samplingDensity, idwPower]);

  const handleAddToLibrary = useCallback(() => {
    if (!result) return;
    const id = `lut_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    addLUT(id, {
      name: result.lut.name,
      size: result.lut.size,
      data: result.lut.data,
    });
    setAddedToLib(true);
    setTimeout(() => setAddedToLib(false), 3000);
  }, [result, addLUT]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            图片配对提取
          </CardTitle>
          <CardDescription>
            上传输入/输出图像对，从颜色映射中提取3DLUT。更多图像对=更广色域覆盖=更精确的LUT
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {pairs.map((pair, index) => (
              <div key={pair.id} className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">图像对 #{index + 1}</Label>
                  {pairs.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removePair(pair.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ImageDropZone
                    label="输入图像 (原始)"
                    imageSrc={pair.inputSrc}
                    imageName={pair.inputName}
                    onImageLoad={(src, name) => {
                      updatePair(pair.id, 'inputSrc', src);
                      updatePair(pair.id, 'inputName', name);
                    }}
                  />
                  <ImageDropZone
                    label="输出图像 (处理后)"
                    imageSrc={pair.outputSrc}
                    imageName={pair.outputName}
                    onImageLoad={(src, name) => {
                      updatePair(pair.id, 'outputSrc', src);
                      updatePair(pair.id, 'outputName', name);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addPair} className="w-full gap-1.5">
            <Plus className="w-4 h-4" />
            添加图像对
          </Button>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">网格大小</Label>
              <Select value={String(gridSize)} onValueChange={(v) => setGridSize(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9">9³ (729 点)</SelectItem>
                  <SelectItem value="17">17³ (4913 点)</SelectItem>
                  <SelectItem value="33">33³ (35937 点)</SelectItem>
                  <SelectItem value="65">65³ (274625 点)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">采样密度</Label>
              <Select value={samplingDensity} onValueChange={(v) => setSamplingDensity(v as 'low' | 'medium' | 'high')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">低 (快速)</SelectItem>
                  <SelectItem value="medium">中 (推荐)</SelectItem>
                  <SelectItem value="high">高 (精确)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">IDW 幂参数: {idwPower}</Label>
              <Slider
                value={[idwPower]}
                onValueChange={([v]) => setIdwPower(v)}
                min={1}
                max={4}
                step={0.5}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground">值越大，近处样本权重越高</p>
            </div>
          </div>

          <Button
            className="w-full gap-2"
            onClick={handleExtract}
            disabled={isExtracting || pairs.every((p) => !p.inputSrc || !p.outputSrc)}
          >
            {isExtracting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            {isExtracting ? '提取中...' : '提取 3DLUT'}
          </Button>

          {isExtracting && (
            <Progress value={progress} className="h-2" />
          )}

          {result && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">提取结果</Label>
                <Badge variant="secondary">{result.lut.size}³</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">网格大小:</span>{' '}
                  <span className="font-medium">{result.lut.size}³</span>
                </div>
                <div>
                  <span className="text-muted-foreground">数据量:</span>{' '}
                  <span className="font-medium">{(result.lut.size ** 3 * 3).toLocaleString()} 浮点值</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">颜色覆盖率</span>
                  <span className="font-medium">{(result.coverage.ratio * 100).toFixed(1)}%</span>
                </div>
                <Progress value={result.coverage.ratio * 100} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {result.coverage.covered} / {result.coverage.total} 个网格点有邻近采样数据
                </p>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleAddToLibrary}
                variant={addedToLib ? 'default' : 'outline'}
              >
                {addedToLib ? (
                  <>
                    <Check className="w-4 h-4" />
                    已添加到库
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    添加到 LUT 库
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Section 2: Calibration Image Workflow ============

function CalibrationImageWorkflow() {
  const { addLUT } = useAppStore();

  const [calibGridSize, setCalibGridSize] = useState(17);
  const [calibStep, setCalibStep] = useState<1 | 2 | 3>(1);
  const [calibrationImageSrc, setCalibrationImageSrc] = useState<string | null>(null);
  const [calibrationImageData, setCalibrationImageData] = useState<ReturnType<typeof generateCalibrationImageData> | null>(null);
  const [processedImageSrc, setProcessedImageSrc] = useState<string | null>(null);
  const [processedImageName, setProcessedImageName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtractingCalib, setIsExtractingCalib] = useState(false);
  const [calibResult, setCalibResult] = useState<LUT3D | null>(null);
  const [calibAddedToLib, setCalibAddedToLib] = useState(false);

  const handleGenerateCalibration = useCallback(() => {
    setIsGenerating(true);
    setTimeout(() => {
      try {
        const data = generateCalibrationImageData(calibGridSize);
        setCalibrationImageData(data);
        const dataUrl = renderCalibrationImage(data);
        setCalibrationImageSrc(dataUrl);
        setCalibStep(2);
      } catch (err) {
        console.error('Calibration generation error:', err);
      } finally {
        setIsGenerating(false);
      }
    }, 100);
  }, [calibGridSize]);

  const handleDownloadCalibration = useCallback(() => {
    if (!calibrationImageSrc) return;
    const a = document.createElement('a');
    a.href = calibrationImageSrc;
    a.download = `calibration_${calibGridSize}cubed.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [calibrationImageSrc, calibGridSize]);

  const handleProcessedImageLoad = useCallback((src: string, name: string) => {
    setProcessedImageSrc(src);
    setProcessedImageName(name);
    setCalibStep(3);
  }, []);

  const handleExtractCalibration = useCallback(async () => {
    if (!calibrationImageSrc || !processedImageSrc || !calibrationImageData) return;

    setIsExtractingCalib(true);

    try {
      const origResult = await loadImageToCanvas(calibrationImageSrc);
      const origImageData = origResult.ctx.getImageData(0, 0, origResult.canvas.width, origResult.canvas.height);

      const procResult = await loadImageToCanvas(processedImageSrc);
      const procImageData = procResult.ctx.getImageData(0, 0, procResult.canvas.width, procResult.canvas.height);

      if (origResult.canvas.width !== procResult.canvas.width || origResult.canvas.height !== procResult.canvas.height) {
        console.warn('Image dimensions do not match, using processed image dimensions for extraction');
      }

      const imageWidth = origResult.canvas.width;

      const lut = extractLUTFromCalibrationPair(
        origImageData.data,
        procImageData.data,
        calibGridSize,
        calibrationImageData.patchSize,
        imageWidth
      );

      setCalibResult(lut);
      setCalibStep(4);
    } catch (err) {
      console.error('Calibration extraction error:', err);
    } finally {
      setIsExtractingCalib(false);
    }
  }, [calibrationImageSrc, processedImageSrc, calibrationImageData, calibGridSize]);

  const handleAddCalibToLibrary = useCallback(() => {
    if (!calibResult) return;
    const id = `lut_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    addLUT(id, {
      name: calibResult.name,
      size: calibResult.size,
      data: calibResult.data,
    });
    setCalibAddedToLib(true);
    setTimeout(() => setCalibAddedToLib(false), 3000);
  }, [calibResult, addLUT]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ImageLucide className="w-4 h-4" />
          校准图提取
        </CardTitle>
        <CardDescription>
          生成校准图，使用外部工具处理后重新上传，提取精确的3DLUT
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors
                  ${calibStep >= step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                  }`}
              >
                {calibStep > step ? <Check className="w-3.5 h-3.5" /> : step}
              </div>
              {step < 4 && (
                <div className={`w-6 h-0.5 ${calibStep > step ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 text-xs text-muted-foreground">
          <span className={calibStep >= 1 ? 'text-foreground font-medium' : ''}>生成校准图</span>
          <span>→</span>
          <span className={calibStep >= 2 ? 'text-foreground font-medium' : ''}>下载并处理</span>
          <span>→</span>
          <span className={calibStep >= 3 ? 'text-foreground font-medium' : ''}>上传处理结果</span>
          <span>→</span>
          <span className={calibStep >= 4 ? 'text-foreground font-medium' : ''}>提取LUT</span>
        </div>

        <Separator />

        <div className="space-y-3">
          <Label className="text-sm font-medium">步骤 1: 生成校准图</Label>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label className="text-xs text-muted-foreground">网格大小</Label>
              <Select value={String(calibGridSize)} onValueChange={(v) => setCalibGridSize(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9">9³ (729 色)</SelectItem>
                  <SelectItem value="17">17³ (4913 色)</SelectItem>
                  <SelectItem value="33">33³ (35937 色)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleGenerateCalibration}
              disabled={isGenerating}
              className="gap-1.5"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              生成校准图
            </Button>
          </div>
        </div>

        {calibStep >= 2 && calibrationImageSrc && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">步骤 2: 下载校准图并使用外部工具处理</Label>
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-3">
                <img
                  src={calibrationImageSrc}
                  alt="校准图"
                  className="w-32 h-24 object-contain rounded border bg-muted"
                />
                <div className="space-y-1 text-sm">
                  <p>网格: <span className="font-medium">{calibGridSize}³ = {calibGridSize ** 3} 色</span></p>
                  {calibrationImageData && (
                    <>
                      <p>色块: <span className="font-medium">{calibrationImageData.patchSize}×{calibrationImageData.patchSize}px</span></p>
                      <p>尺寸: <span className="font-medium">{calibrationImageData.imageWidth}×{calibrationImageData.imageHeight}px</span></p>
                    </>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadCalibration}
                className="gap-1.5"
              >
                <Download className="w-4 h-4" />
                下载校准图 PNG
              </Button>
            </div>
          </div>
        )}

        {calibStep >= 2 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">步骤 3: 上传处理后的校准图</Label>
            <ImageDropZone
              label="处理后的校准图"
              imageSrc={processedImageSrc}
              imageName={processedImageName}
              onImageLoad={handleProcessedImageLoad}
            />
          </div>
        )}

        {calibStep >= 3 && calibrationImageSrc && processedImageSrc && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">对比预览</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="border rounded-lg p-2">
                <p className="text-xs text-muted-foreground mb-1">原始校准图</p>
                <img src={calibrationImageSrc} alt="原始" className="w-full object-contain rounded" />
              </div>
              <div className="border rounded-lg p-2">
                <p className="text-xs text-muted-foreground mb-1">处理后校准图</p>
                <img src={processedImageSrc} alt="处理后" className="w-full object-contain rounded" />
              </div>
            </div>

            <Button
              className="w-full gap-2"
              onClick={handleExtractCalibration}
              disabled={isExtractingCalib}
            >
              {isExtractingCalib ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {isExtractingCalib ? '提取中...' : '步骤 4: 提取 3DLUT'}
            </Button>
          </div>
        )}

        {calibResult && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">提取结果</Label>
              <Badge variant="secondary">{calibResult.size}³</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">网格大小:</span>{' '}
                <span className="font-medium">{calibResult.size}³</span>
              </div>
              <div>
                <span className="text-muted-foreground">数据量:</span>{' '}
                <span className="font-medium">{(calibResult.size ** 3 * 3).toLocaleString()} 浮点值</span>
              </div>
            </div>

            <Button
              className="w-full gap-2"
              onClick={handleAddCalibToLibrary}
              variant={calibAddedToLib ? 'default' : 'outline'}
            >
              {calibAddedToLib ? (
                <>
                  <Check className="w-4 h-4" />
                  已添加到库
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  添加到 LUT 库
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ Main Component ============

export default function LutExtractTab() {
  return (
    <div className="space-y-6">
      <ImagePairExtraction />
      <CalibrationImageWorkflow />
    </div>
  );
}
