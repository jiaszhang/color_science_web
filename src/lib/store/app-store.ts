/**
 * Global application store using Zustand
 * Manages pipeline state, LUT library, undo/redo, configuration, navigation
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============ Types ============

export type ModuleId =
  | 'pipeline'
  | 'color-fundamentals'
  | 'lut3d'
  | 'gamut-calibration'
  | 'simulation'
  | 'visualization';

export interface PipelineNode {
  id: string;
  type: string;
  name: string;
  params: Record<string, unknown>;
  enabled: boolean;
  position: { x: number; y: number };
}

export interface Pipeline {
  id: string;
  name: string;
  nodes: PipelineNode[];
  edges: { from: string; to: string }[];
  createdAt: number;
  updatedAt: number;
}

export interface ConfigVersion {
  id: string;
  name: string;
  description: string;
  data: string;
  createdAt: number;
}

export interface PipelinePreset {
  id: string;
  name: string;
  description: string;
  nodes: PipelineNode[];
  isBuiltIn?: boolean;
  createdAt: number;
}

export interface ProjectConfig {
  id: string;
  name: string;
  pipeline?: Pipeline;
  settings: Record<string, unknown>;
  versions: ConfigVersion[];
  createdAt: number;
  updatedAt: number;
}

// ============ Built-in presets ============

export const BUILT_IN_PRESETS: PipelinePreset[] = [
  {
    id: 'preset-srgb-to-p3',
    name: '标准转换 sRGB→P3',
    description: '将 sRGB 色域转换为 DCI-P3 色域',
    isBuiltIn: true,
    createdAt: 0,
    nodes: [
      { id: 'n1', type: 'gamut-convert', name: '色域转换', params: { srcGamut: 'sRGB', srcTF: 'sRGB', dstGamut: 'DCI_P3', dstTF: 'sRGB' }, enabled: true, position: { x: 0, y: 0 } },
    ],
  },
  {
    id: 'preset-hdr-pq',
    name: 'HDR 转换 sRGB→2020 PQ',
    description: 'sRGB 转 Rec.2020 配合 ST.2084 PQ 传输函数',
    isBuiltIn: true,
    createdAt: 0,
    nodes: [
      { id: 'n1', type: 'gamut-convert', name: '色域转换', params: { srcGamut: 'sRGB', srcTF: 'sRGB', dstGamut: 'Rec2020', dstTF: 'st2084' }, enabled: true, position: { x: 0, y: 0 } },
    ],
  },
  {
    id: 'preset-hdr-hlg',
    name: 'HDR 转换 sRGB→2020 HLG',
    description: 'sRGB 转 Rec.2020 配合 HLG 传输函数',
    isBuiltIn: true,
    createdAt: 0,
    nodes: [
      { id: 'n1', type: 'gamut-convert', name: '色域转换', params: { srcGamut: 'sRGB', srcTF: 'sRGB', dstGamut: 'Rec2020', dstTF: 'hlg' }, enabled: true, position: { x: 0, y: 0 } },
    ],
  },
  {
    id: 'preset-gamma-correct',
    name: 'Gamma 校正',
    description: '调整 Gamma 值进行色调校正',
    isBuiltIn: true,
    createdAt: 0,
    nodes: [
      { id: 'n1', type: 'gamma', name: 'Gamma 调整', params: { gamma: 1.8 }, enabled: true, position: { x: 0, y: 0 } },
    ],
  },
  {
    id: 'preset-adobe-workflow',
    name: 'AdobeRGB 工作流',
    description: 'sRGB 转 AdobeRGB 配合 Gamma 2.2',
    isBuiltIn: true,
    createdAt: 0,
    nodes: [
      { id: 'n1', type: 'gamut-convert', name: '色域转换', params: { srcGamut: 'sRGB', srcTF: 'sRGB', dstGamut: 'AdobeRGB', dstTF: 'gamma22' }, enabled: true, position: { x: 0, y: 0 } },
    ],
  },
];

// ============ App Store ============

interface AppState {
  // Navigation
  activeModule: ModuleId;
  activeTab: string;
  setActiveModule: (module: ModuleId) => void;
  setActiveTab: (tab: string) => void;
  navigateToTab: (module: ModuleId, tab: string) => void;

  // Pipeline management
  pipelines: Pipeline[];
  activePipelineId: string | null;
  createPipeline: (name: string) => string;
  updatePipeline: (id: string, updates: Partial<Pipeline>) => void;
  deletePipeline: (id: string) => void;
  getActivePipeline: () => Pipeline | undefined;

  // Pipeline presets
  customPresets: PipelinePreset[];
  addCustomPreset: (preset: Omit<PipelinePreset, 'id' | 'createdAt' | 'isBuiltIn'>) => void;
  deleteCustomPreset: (id: string) => void;

  // LUT Library
  lutLibrary: Map<string, { name: string; size: number; data: Float32Array; srcGamut?: string; dstGamut?: string; createdAt: number }>;
  addLUT: (id: string, lut: { name: string; size: number; data: Float32Array; srcGamut?: string; dstGamut?: string; createdAt?: number }) => void;
  removeLUT: (id: string) => void;
  renameLUT: (id: string, name: string) => void;

  // Project configs & Version management
  projects: ProjectConfig[];
  activeProjectId: string | null;
  createProject: (name: string) => string;
  updateProject: (id: string, updates: Partial<ProjectConfig>) => void;
  deleteProject: (id: string) => void;
  setActiveProjectId: (id: string | null) => void;
  saveVersion: (projectId: string, name: string, description: string) => void;
  restoreVersion: (projectId: string, versionId: string) => void;
  deleteVersion: (projectId: string, versionId: string) => void;

  // History
  history: { id: string; action: string; data: string; timestamp: number }[];
  addHistoryEntry: (action: string, data: string) => void;
  clearHistory: () => void;

  // Undo/Redo
  undoStack: string[];
  redoStack: string[];
  pushUndoState: (state: string) => void;
  undo: () => string | undefined;
  redo: () => string | undefined;

  // Batch processing
  batchProcessing: boolean;
  batchProgress: number;
  batchTotal: number;
  setBatchProcessing: (processing: boolean) => void;
  setBatchProgress: (progress: number, total: number) => void;

  // Parameter lock
  lockedParams: Set<string>;
  toggleParamLock: (param: string) => void;
  isParamLocked: (param: string) => boolean;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Navigation
      activeModule: 'pipeline' as ModuleId,
      activeTab: 'flow-manage',
      setActiveModule: (module) => set({ activeModule: module }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      navigateToTab: (module, tab) => set({ activeModule: module, activeTab: tab }),

      // Pipeline
      pipelines: [],
      activePipelineId: null,

      createPipeline: (name) => {
        const id = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const pipeline: Pipeline = {
          id,
          name,
          nodes: [],
          edges: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          pipelines: [...state.pipelines, pipeline],
          activePipelineId: id,
        }));
        get().addHistoryEntry('创建流程', JSON.stringify({ name, id }));
        return id;
      },

      updatePipeline: (id, updates) => {
        set((state) => ({
          pipelines: state.pipelines.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
          ),
        }));
      },

      deletePipeline: (id) => {
        set((state) => ({
          pipelines: state.pipelines.filter((p) => p.id !== id),
          activePipelineId: state.activePipelineId === id ? null : state.activePipelineId,
        }));
        get().addHistoryEntry('删除流程', id);
      },

      getActivePipeline: () => {
        const { pipelines, activePipelineId } = get();
        return pipelines.find((p) => p.id === activePipelineId);
      },

      // Pipeline presets
      customPresets: [],

      addCustomPreset: (preset) => {
        const id = `cpreset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newPreset: PipelinePreset = {
          ...preset,
          id,
          isBuiltIn: false,
          createdAt: Date.now(),
        };
        set((state) => ({
          customPresets: [...state.customPresets, newPreset],
        }));
        get().addHistoryEntry('创建自定义预设', newPreset.name);
      },

      deleteCustomPreset: (id) => {
        set((state) => ({
          customPresets: state.customPresets.filter((p) => p.id !== id),
        }));
      },

      // LUT Library (not persisted due to Float32Array)
      lutLibrary: new Map(),

      addLUT: (id, lut) => {
        set((state) => {
          const newLib = new Map(state.lutLibrary);
          newLib.set(id, { ...lut, createdAt: lut.createdAt || Date.now() });
          return { lutLibrary: newLib };
        });
      },

      removeLUT: (id) => {
        set((state) => {
          const newLib = new Map(state.lutLibrary);
          newLib.delete(id);
          return { lutLibrary: newLib };
        });
      },

      renameLUT: (id, name) => {
        set((state) => {
          const newLib = new Map(state.lutLibrary);
          const entry = newLib.get(id);
          if (entry) {
            newLib.set(id, { ...entry, name });
          }
          return { lutLibrary: newLib };
        });
      },

      // Projects
      projects: [],
      activeProjectId: null,

      createProject: (name) => {
        const id = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const project: ProjectConfig = {
          id,
          name,
          settings: {},
          versions: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          projects: [...state.projects, project],
          activeProjectId: id,
        }));
        get().addHistoryEntry('创建工程', name);
        return id;
      },

      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
          ),
        }));
      },

      deleteProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }));
      },

      setActiveProjectId: (id) => set({ activeProjectId: id }),

      saveVersion: (projectId, name, description) => {
        const state = get();
        const project = state.projects.find((p) => p.id === projectId);
        if (!project) return;

        const snapshotData = JSON.stringify({
          pipelines: state.pipelines,
          customPresets: state.customPresets,
          activePipelineId: state.activePipelineId,
        });

        const version: ConfigVersion = {
          id: `version_${Date.now()}`,
          name,
          description,
          data: snapshotData,
          createdAt: Date.now(),
        };

        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? { ...p, versions: [...p.versions, version], updatedAt: Date.now() }
              : p
          ),
        }));
        get().addHistoryEntry(`保存版本 "${name}"`, `工程: ${project.name}`);
      },

      restoreVersion: (projectId, versionId) => {
        const state = get();
        const project = state.projects.find((p) => p.id === projectId);
        if (!project) return;
        const version = project.versions.find((v) => v.id === versionId);
        if (!version) return;

        try {
          const snapshot = JSON.parse(version.data);
          if (snapshot.pipelines) set({ pipelines: snapshot.pipelines });
          if (snapshot.customPresets) set({ customPresets: snapshot.customPresets });
          if (snapshot.activePipelineId) set({ activePipelineId: snapshot.activePipelineId });
          get().addHistoryEntry(`恢复版本 "${version.name}"`, `工程: ${project.name}`);
        } catch {
          console.error('Failed to restore version');
        }
      },

      deleteVersion: (projectId, versionId) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? { ...p, versions: p.versions.filter((v) => v.id !== versionId), updatedAt: Date.now() }
              : p
          ),
        }));
      },

      // History
      history: [],

      addHistoryEntry: (action, data) => {
        set((state) => ({
          history: [
            { id: `h_${Date.now()}`, action, data, timestamp: Date.now() },
            ...state.history.slice(0, 99), // Keep last 100 entries
          ],
        }));
      },

      clearHistory: () => set({ history: [] }),

      // Undo/Redo
      undoStack: [],
      redoStack: [],

      pushUndoState: (state) => {
        set((s) => ({
          undoStack: [...s.undoStack.slice(-50), state],
          redoStack: [],
        }));
      },

      undo: () => {
        const { undoStack } = get();
        if (undoStack.length === 0) return undefined;
        const last = undoStack[undoStack.length - 1];
        set((s) => ({
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, last],
        }));
        return last;
      },

      redo: () => {
        const { redoStack } = get();
        if (redoStack.length === 0) return undefined;
        const last = redoStack[redoStack.length - 1];
        set((s) => ({
          redoStack: s.redoStack.slice(0, -1),
          undoStack: [...s.undoStack, last],
        }));
        return last;
      },

      // Batch processing
      batchProcessing: false,
      batchProgress: 0,
      batchTotal: 0,

      setBatchProcessing: (processing) => set({ batchProcessing: processing }),
      setBatchProgress: (progress, total) => set({ batchProgress: progress, batchTotal: total }),

      // Parameter lock
      lockedParams: new Set(),

      toggleParamLock: (param) => {
        set((state) => {
          const newLocked = new Set(
            state.lockedParams instanceof Set ? state.lockedParams : Array.isArray(state.lockedParams) ? state.lockedParams : []
          );
          if (newLocked.has(param)) newLocked.delete(param);
          else newLocked.add(param);
          return { lockedParams: newLocked };
        });
      },

      isParamLocked: (param) => {
        const lp = get().lockedParams;
        if (lp instanceof Set) return lp.has(param);
        return false;
      },
    }),
    {
      name: 'colorpipeline-store',
      partialize: (state) => ({
        pipelines: state.pipelines,
        activePipelineId: state.activePipelineId,
        customPresets: state.customPresets,
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        history: state.history,
        lockedParams: Array.from(state.lockedParams),
      }),
      merge: (persisted, current) => {
        const p = persisted as Record<string, unknown>;
        return {
          ...current,
          ...p,
          // Rehydrate Set from array
          lockedParams: Array.isArray(p.lockedParams) ? new Set(p.lockedParams) : current.lockedParams,
          // lutLibrary is not persisted (Float32Array), always reset
          lutLibrary: current.lutLibrary,
        };
      },
    }
  )
);
