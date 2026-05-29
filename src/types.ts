export const CANONICAL_KINDS = [
  "person",
  "project",
  "concept",
  "decision",
  "question",
  "tool",
  "workThread",
  "dailyNote",
  "source",
  "repo",
  "incident",
  "organization",
  "index",
  "unknown"
] as const;

export type NodeKind = (typeof CANONICAL_KINDS)[number];

export interface BrainNode {
  id: string;
  name: string;
  title: string;
  kind: NodeKind;
  kindLabel: string;
  status: "active" | "dormantRelevant" | "archived";
  hub: boolean;
  degree: number;
  color: string;
  path: string;
  freshness: number;
  recencyHours: number | null;
  mtime?: number;
  _baseX?: number;
  _baseY?: number;
  _micro?: boolean;
  _wphase?: number;
  _wfreq?: number;
  parentId?: string;
}

export interface BrainEdge {
  a: string;
  b: string;
}

export interface BrainGraph {
  nodes: BrainNode[];
  edges: BrainEdge[];
  idx: Record<string, BrainNode>;
  adj: Record<string, string[]>;
  KIND_LABEL: Record<string, string>;
  activePalette: BrainPalette;
  activePaletteName: string;
  CHAOS: BrainChaos;
  rev?: string;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface BrainPalette {
  label: string;
  bg: string;
  bgFar: string;
  fg: string;
  hud: string;
  chroma: number;
  kinds: Record<string, string>;
}

export interface BrainChaos {
  wobbleAmp: number;
  wobbleSpeed: number;
  halo: number;
  bloom: number;
  blob: number;
  jitter: number;
}
