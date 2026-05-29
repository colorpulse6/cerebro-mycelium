import type { NodeKind } from "./types.ts";

export type PaletteName = "wood" | "graphite" | "ink" | "magma" | "bio" | "acid" | "aurora";
export type ClickBehaviour = "focus-then-open" | "single-click-open";

export interface PinnedNodePosition {
  x: number;
  y: number;
}

export interface CerebroMyceliumSettings {
  palette: PaletteName;
  frontmatterKindKeys: string[];
  tagKindMap: Record<string, NodeKind>;
  folderKindMap: Record<string, NodeKind>;
  treatDateFilesAsDaily: boolean;
  honorDailyNotesFormat: boolean;
  dailyNoteDateFormat: string;
  nodeCap: number;
  edgeCap: number;
  hubThresholdPercent: number;
  recencyWindowHours: number;
  showDecorativeMicroLeaves: boolean;
  showClusterHaze: boolean;
  sporeDensity: number;
  pauseAnimationWhenHidden: boolean;
  clickBehaviour: ClickBehaviour;
  pinnedNodePositions: Record<string, PinnedNodePosition>;
}

export type BrainAtlasSettings = CerebroMyceliumSettings;

export const DEFAULT_SETTINGS: CerebroMyceliumSettings = {
  palette: "wood",
  frontmatterKindKeys: ["kind", "type", "category"],
  tagKindMap: {
    project: "project",
    person: "person",
    decision: "decision",
    question: "question",
    tool: "tool",
    concept: "concept",
    source: "source",
    daily: "dailyNote",
    moc: "concept",
    thread: "workThread",
    index: "index"
  },
  folderKindMap: {
    People: "person",
    Projects: "project",
    Sources: "source",
    Daily: "dailyNote",
    Journal: "dailyNote",
    Concepts: "concept",
    Topics: "concept",
    MOCs: "concept",
    Maps: "concept",
    Index: "index",
    Home: "index"
  },
  treatDateFilesAsDaily: true,
  honorDailyNotesFormat: true,
  dailyNoteDateFormat: "YYYY-MM-DD",
  nodeCap: 1500,
  edgeCap: 4000,
  hubThresholdPercent: 4,
  recencyWindowHours: 24,
  showDecorativeMicroLeaves: false,
  showClusterHaze: true,
  sporeDensity: 50,
  pauseAnimationWhenHidden: true,
  clickBehaviour: "focus-then-open",
  pinnedNodePositions: {}
};

export function normalizeSettings(input: Partial<CerebroMyceliumSettings> | null | undefined): CerebroMyceliumSettings {
  const raw = input ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    palette: normalizePalette(raw.palette),
    frontmatterKindKeys: raw.frontmatterKindKeys ?? DEFAULT_SETTINGS.frontmatterKindKeys,
    tagKindMap: { ...DEFAULT_SETTINGS.tagKindMap, ...(raw.tagKindMap ?? {}) },
    folderKindMap: { ...DEFAULT_SETTINGS.folderKindMap, ...(raw.folderKindMap ?? {}) },
    nodeCap: clampNumber(raw.nodeCap, 200, 10000, DEFAULT_SETTINGS.nodeCap),
    edgeCap: clampNumber(raw.edgeCap, 200, 20000, DEFAULT_SETTINGS.edgeCap),
    hubThresholdPercent: clampNumber(raw.hubThresholdPercent, 1, 20, DEFAULT_SETTINGS.hubThresholdPercent),
    recencyWindowHours: clampNumber(raw.recencyWindowHours, 1, 168, DEFAULT_SETTINGS.recencyWindowHours),
    sporeDensity: clampNumber(raw.sporeDensity, 0, 100, DEFAULT_SETTINGS.sporeDensity),
    clickBehaviour: raw.clickBehaviour === "single-click-open" ? "single-click-open" : "focus-then-open",
    pinnedNodePositions: normalizePinnedNodePositions(raw.pinnedNodePositions)
  };
}

export function normalizePinnedNodePositions(input: unknown): Record<string, PinnedNodePosition> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, PinnedNodePosition> = {};
  for (const [path, rawPosition] of Object.entries(input)) {
    if (!path || !rawPosition || typeof rawPosition !== "object" || Array.isArray(rawPosition)) continue;
    const position = rawPosition as Partial<PinnedNodePosition>;
    if (typeof position.x !== "number" || !Number.isFinite(position.x)) continue;
    if (typeof position.y !== "number" || !Number.isFinite(position.y)) continue;
    out[path] = {
      x: clamp(position.x, 0.04, 0.96),
      y: clamp(position.y, 0.06, 0.94)
    };
  }
  return out;
}

function normalizePalette(value: unknown): PaletteName {
  if (
    value === "wood" ||
    value === "graphite" ||
    value === "ink" ||
    value === "magma" ||
    value === "bio" ||
    value === "acid" ||
    value === "aurora"
  ) {
    return value;
  }
  return DEFAULT_SETTINGS.palette;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
