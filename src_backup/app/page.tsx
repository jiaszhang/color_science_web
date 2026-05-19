'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
  SidebarRail,
} from '@/components/ui/sidebar';
import {
  GitBranch,
  Palette,
  Box,
  Target,
  Eye,
  BarChart3,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ModuleId } from '@/lib/store/app-store';
import { useAppStore } from '@/lib/store/app-store';
import dynamic from 'next/dynamic';

const ColorFundamentalsModule = dynamic(
  () => import('@/components/modules/color-fundamentals-module'),
  { ssr: false, loading: () => <ModuleLoadingSkeleton /> }
);
const Lut3dModule = dynamic(
  () => import('@/components/modules/lut3d-module'),
  { ssr: false, loading: () => <ModuleLoadingSkeleton /> }
);
const GamutCalibrationModule = dynamic(
  () => import('@/components/modules/gamut-calibration-module'),
  { ssr: false, loading: () => <ModuleLoadingSkeleton /> }
);
const SimulationModule = dynamic(
  () => import('@/components/modules/simulation-module'),
  { ssr: false, loading: () => <ModuleLoadingSkeleton /> }
);
const PipelineModule = dynamic(
  () => import('@/components/modules/pipeline-module'),
  { ssr: false, loading: () => <ModuleLoadingSkeleton /> }
);
const VisualizationModule = dynamic(
  () => import('@/components/modules/visualization-module'),
  { ssr: false, loading: () => <ModuleLoadingSkeleton /> }
);

function ModuleLoadingSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="h-8 w-8 rounded-lg bg-muted" />
        <div className="h-4 w-48 rounded bg-muted" />
        <div className="h-32 w-96 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

interface SubItemConfig {
  id: string;
  name: string;
}

interface ModuleConfig {
  id: ModuleId;
  name: string;
  icon: React.ElementType;
  badge?: string;
  subItems?: SubItemConfig[];
}

const modules: ModuleConfig[] = [
  {
    id: 'pipeline',
    name: '通路 / 流程',
    icon: GitBranch,
    subItems: [
      { id: 'flow-manage', name: '流程管理' },
      { id: 'flow-simulate', name: '通路模拟' },
      { id: 'flow-presets', name: '流程预设' },
      { id: 'batch-process', name: '批处理' },
      { id: 'intermediate-view', name: '中间结果查看' },
    ],
  },
  {
    id: 'color-fundamentals',
    name: '色彩基础',
    icon: Palette,
    subItems: [
      { id: 'gamut-convert', name: '色域转换' },
      { id: 'xy-to-rgb', name: 'xy→RGB' },
      { id: 'transfer-func', name: '传输函数' },
      { id: 'gamma', name: 'Gamma' },
      { id: 'video-range', name: '范围转换' },
      { id: 'matrix-ops', name: '矩阵运算' },
      { id: 'param-presets', name: '参数预设' },
      { id: 'param-lock', name: '参数联动/锁定' },
    ],
  },
  {
    id: 'lut3d',
    name: '3DLUT',
    icon: Box,
    subItems: [
      { id: 'lut-apply', name: 'LUT 应用' },
      { id: 'lut-generate', name: 'LUT 生成' },
      { id: 'lut-manage', name: 'LUT 管理' },
      { id: 'lut-import', name: 'LUT 导入' },
      { id: 'lut-export', name: 'LUT 导出' },
    ],
  },
  {
    id: 'gamut-calibration',
    name: '色域/色彩校准',
    icon: Target,
    subItems: [
      { id: 'gamut-calc', name: '色域转换计算' },
      { id: 'gamut-coverage', name: '色域覆盖率' },
      { id: 'color-temp', name: '色温/白点' },
      { id: 'calibration', name: '校准' },
      { id: 'measurement', name: '测量数据' },
    ],
  },
  {
    id: 'simulation',
    name: '仿真与验证',
    icon: Eye,
    subItems: [
      { id: 'image-sim', name: '图片仿真' },
      { id: 'rgb-sim', name: 'RGB 仿真' },
      { id: 'value-compare', name: '数值对比' },
      { id: 'error-eval', name: '误差评估' },
      { id: 'report', name: '结果报告' },
    ],
  },
  {
    id: 'visualization',
    name: '可视化/工程',
    icon: BarChart3,
    badge: '11项',
    subItems: [
      { id: 'flow-viz', name: '流程可视化' },
      { id: 'curve-viz', name: '曲线可视化' },
      { id: 'lut-viz', name: '3DLUT 可视化' },
      { id: 'param-config', name: '参数配置' },
      { id: 'project-config', name: '工程配置' },
      { id: 'plugin-ext', name: '模块扩展' },
      { id: 'version-mgmt', name: '配置版本' },
      { id: 'env-preset', name: '环境预设' },
      { id: 'debug-snap', name: '调试与快照' },
      { id: 'automation', name: '自动化接口' },
      { id: 'interaction', name: '交互增强' },
    ],
  },
];

export default function Home() {
  const { activeModule, activeTab, navigateToTab, setActiveModule } = useAppStore();
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(['pipeline']));
  const { undo, redo, undoStack, redoStack } = useAppStore();

  const currentModuleConfig = useMemo(() => modules.find((m) => m.id === activeModule), [activeModule]);
  const currentSubName = useMemo(() => {
    if (!currentModuleConfig?.subItems) return '';
    const sub = currentModuleConfig.subItems.find((s) => s.id === activeTab);
    return sub?.name || '';
  }, [currentModuleConfig, activeTab]);

  const toggleModule = useCallback((id: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSubItemClick = useCallback((moduleId: ModuleId, subId: string) => {
    navigateToTab(moduleId, subId);
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.add(moduleId);
      return next;
    });
  }, [navigateToTab]);

  const handleUndo = useCallback(() => { undo(); }, [undo]);
  const handleRedo = useCallback(() => { redo(); }, [redo]);

  const renderModule = () => {
    switch (activeModule) {
      case 'pipeline':
        return <PipelineModule />;
      case 'color-fundamentals':
        return <ColorFundamentalsModule />;
      case 'lut3d':
        return <Lut3dModule />;
      case 'gamut-calibration':
        return <GamutCalibrationModule />;
      case 'simulation':
        return <SimulationModule />;
      case 'visualization':
        return <VisualizationModule />;
      default:
        return <ColorFundamentalsModule />;
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <SidebarProvider defaultOpen>
        <Sidebar collapsible="icon" variant="sidebar">
          <SidebarHeader className="px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Palette className="h-4 w-4" />
              </div>
              <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-bold tracking-tight">ColorPipeline</span>
                <span className="text-[10px] text-muted-foreground">色彩处理流水线</span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent className="px-2">
            {modules.map((mod) => {
              const Icon = mod.icon;
              const isExpanded = expandedModules.has(mod.id);
              const isActive = activeModule === mod.id;

              return (
                <SidebarGroup key={mod.id}>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => {
                          setActiveModule(mod.id);
                          toggleModule(mod.id);
                        }}
                        tooltip={mod.name}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1 group-data-[collapsible=icon]:hidden">{mod.name}</span>
                        {mod.badge && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 group-data-[collapsible=icon]:hidden">
                            {mod.badge}
                          </Badge>
                        )}
                        {mod.subItems && mod.subItems.length > 0 && (
                          <ChevronDown
                            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        )}
                      </SidebarMenuButton>
                      {isExpanded && mod.subItems && (
                        <SidebarMenuSub>
                          {mod.subItems.map((sub) => {
                            const isSubActive = isActive && activeTab === sub.id;
                            return (
                              <SidebarMenuSubItem key={sub.id}>
                                <SidebarMenuSubButton
                                  isActive={isSubActive}
                                  onClick={() => {
                                    handleSubItemClick(mod.id, sub.id);
                                  }}
                                >
                                  <span className="truncate">{sub.name}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroup>
              );
            })}
          </SidebarContent>
          <SidebarFooter className="px-2 pb-3">
            <Separator className="mb-2" />
            <div className="flex items-center gap-1 justify-center group-data-[collapsible=icon]:flex-col">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0}
                  >
                    <span className="text-xs">↩</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">撤销</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleRedo}
                    disabled={redoStack.length === 0}
                  >
                    <span className="text-xs">↪</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">重做</TooltipContent>
              </Tooltip>
            </div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        {/* Main Content */}
        <div className="flex flex-1 flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <h1 className="text-sm font-semibold truncate">
                {currentModuleConfig?.name || '色彩处理流水线'}
              </h1>
              {currentSubName && (
                <>
                  <span className="text-muted-foreground text-xs">/</span>
                  <span className="text-xs text-muted-foreground truncate">{currentSubName}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleUndo} disabled={undoStack.length === 0}>
                <span className="mr-1">↩</span> 撤销
              </Button>
              <Button variant="outline" size="sm" onClick={handleRedo} disabled={redoStack.length === 0}>
                <span className="mr-1">↪</span> 重做
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-auto min-h-0">
            {renderModule()}
          </main>

          <footer className="border-t px-4 py-2 flex items-center justify-between text-xs text-muted-foreground shrink-0">
            <span>ColorPipeline v1.0 — 色彩处理流水线</span>
            <span>z.ai</span>
          </footer>
        </div>
      </SidebarProvider>
    </div>
  );
}
