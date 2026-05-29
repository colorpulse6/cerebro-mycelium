import { rng, strHash } from "./filaments.ts";
import type { CerebroMyceliumSettings } from "./settings.ts";
import type { BrainEdge, BrainGraph, BrainNode, NodeKind, Vec2 } from "./types.ts";

const KIND_CENTERS: Record<NodeKind, Vec2> = {
  project: { x: 0.31, y: 0.43 },
  decision: { x: 0.36, y: 0.36 },
  question: { x: 0.42, y: 0.32 },
  concept: { x: 0.53, y: 0.24 },
  tool: { x: 0.62, y: 0.28 },
  workThread: { x: 0.58, y: 0.42 },
  person: { x: 0.69, y: 0.48 },
  organization: { x: 0.75, y: 0.42 },
  source: { x: 0.26, y: 0.68 },
  repo: { x: 0.31, y: 0.75 },
  dailyNote: { x: 0.66, y: 0.73 },
  incident: { x: 0.58, y: 0.77 },
  index: { x: 0.5, y: 0.57 },
  unknown: { x: 0.5, y: 0.5 }
};

export function assignPositions(graph: BrainGraph, settings: CerebroMyceliumSettings): void {
  const nodes = graph.nodes.filter((node) => !node._micro);
  for (const node of nodes) {
    const center = KIND_CENTERS[node.kind] ?? KIND_CENTERS.concept;
    const random = rng(strHash(`layout:${node.id}`));
    const angle = random() * Math.PI * 2;
    const dist = 0.035 + random() * (node.hub ? 0.09 : 0.17);
    node._baseX = clamp(center.x + Math.cos(angle) * dist * (0.72 + random() * 0.5), 0.04, 0.96);
    node._baseY = clamp(center.y + Math.sin(angle) * dist * (0.62 + random() * 0.52), 0.06, 0.94);
    node._wphase = random() * Math.PI * 2;
    node._wfreq = 0.35 + random() * 0.55;
  }

  const iterations = nodes.length > 600 ? 28 : 44;
  for (let i = 0; i < iterations; i += 1) {
    pullTowardKindCenters(nodes, 0.012);
    applyEdgeSprings(graph.edges, graph.idx, settings.edgeCap > 2500 ? 0.012 : 0.015);
    repelWithinKinds(nodes, nodes.length > 700 ? 38 : 72);
  }

  for (const node of nodes) {
    node._baseX = round(clamp(node._baseX ?? 0.5, 0.04, 0.96));
    node._baseY = round(clamp(node._baseY ?? 0.5, 0.06, 0.94));
  }

  applyPinnedPositions(nodes, settings);
}

export function prepareRenderableGraph(graph: BrainGraph, settings: CerebroMyceliumSettings): BrainGraph {
  const clone = cloneGraph(graph);
  assignPositions(clone, settings);
  if (!settings.showDecorativeMicroLeaves) return clone;
  return withDecorativeMicroLeaves(clone);
}

export function cloneGraph(graph: BrainGraph): BrainGraph {
  const nodes = graph.nodes.map((node) => ({ ...node }));
  const edges = graph.edges.map((edge) => ({ ...edge }));
  return {
    ...graph,
    nodes,
    edges,
    idx: Object.fromEntries(nodes.map((node) => [node.id, node])),
    adj: Object.fromEntries(Object.entries(graph.adj).map(([id, adj]) => [id, [...adj]]))
  };
}

function pullTowardKindCenters(nodes: BrainNode[], strength: number): void {
  for (const node of nodes) {
    const center = KIND_CENTERS[node.kind] ?? KIND_CENTERS.concept;
    node._baseX = (node._baseX ?? center.x) + (center.x - (node._baseX ?? center.x)) * strength;
    node._baseY = (node._baseY ?? center.y) + (center.y - (node._baseY ?? center.y)) * strength;
  }
}

function applyEdgeSprings(edges: BrainEdge[], idx: Record<string, BrainNode>, strength: number): void {
  for (const edge of edges) {
    const a = idx[edge.a];
    const b = idx[edge.b];
    if (!a || !b || a._micro || b._micro) continue;
    const dx = (b._baseX ?? 0.5) - (a._baseX ?? 0.5);
    const dy = (b._baseY ?? 0.5) - (a._baseY ?? 0.5);
    const dist = Math.hypot(dx, dy) || 0.001;
    const target = a.kind === b.kind ? 0.08 : 0.18;
    const force = (dist - target) * strength;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a._baseX = (a._baseX ?? 0.5) + fx;
    a._baseY = (a._baseY ?? 0.5) + fy;
    b._baseX = (b._baseX ?? 0.5) - fx;
    b._baseY = (b._baseY ?? 0.5) - fy;
  }
}

function repelWithinKinds(nodes: BrainNode[], neighborWindow: number): void {
  const grouped = new Map<NodeKind, BrainNode[]>();
  for (const node of nodes) grouped.set(node.kind, [...(grouped.get(node.kind) ?? []), node]);

  for (const group of grouped.values()) {
    const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < ordered.length; i += 1) {
      const a = ordered[i];
      for (let j = i + 1; j < Math.min(ordered.length, i + neighborWindow); j += 1) {
        const b = ordered[j];
        const dx = (b._baseX ?? 0.5) - (a._baseX ?? 0.5);
        const dy = (b._baseY ?? 0.5) - (a._baseY ?? 0.5);
        const dist = Math.hypot(dx, dy) || 0.001;
        const minDist = 0.018 + Math.min(0.018, (a.degree + b.degree) * 0.001);
        if (dist >= minDist) continue;
        const force = (minDist - dist) * 0.025;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a._baseX = (a._baseX ?? 0.5) - fx;
        a._baseY = (a._baseY ?? 0.5) - fy;
        b._baseX = (b._baseX ?? 0.5) + fx;
        b._baseY = (b._baseY ?? 0.5) + fy;
      }
    }
  }
}

function withDecorativeMicroLeaves(base: BrainGraph): BrainGraph {
  const nodes = base.nodes.map((node) => ({ ...node }));
  const edges = base.edges.map((edge) => ({ ...edge }));
  const adj: Record<string, string[]> = Object.fromEntries(Object.entries(base.adj).map(([id, list]) => [id, [...list]]));
  const seeds = nodes.filter((node) => node.degree >= 2 && !node._micro);

  for (const parent of seeds) {
    const random = rng(strHash(`micro:${parent.id}`));
    const count = parent.hub ? 12 + Math.floor(random() * 5) : Math.min(8, Math.max(2, Math.floor(parent.degree * 0.55)));
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const dist = 0.018 + random() * 0.06;
      const id = `${parent.id}.m${i}`;
      const node: BrainNode = {
        ...parent,
        id,
        path: parent.path,
        name: "",
        title: "",
        hub: false,
        degree: 1,
        _micro: true,
        parentId: parent.id,
        _baseX: clamp((parent._baseX ?? 0.5) + Math.cos(angle) * dist, 0.03, 0.97),
        _baseY: clamp((parent._baseY ?? 0.5) + Math.sin(angle) * dist * 0.85, 0.04, 0.96),
        _wphase: random() * Math.PI * 2,
        _wfreq: 0.4 + random() * 0.5
      };
      nodes.push(node);
      edges.push({ a: parent.id, b: id });
      adj[parent.id] = [...(adj[parent.id] ?? []), id];
      adj[id] = [parent.id];
    }
  }

  return {
    ...base,
    nodes,
    edges,
    idx: Object.fromEntries(nodes.map((node) => [node.id, node])),
    adj,
    rev: `${base.rev ?? "graph"}:micro`
  };
}

function applyPinnedPositions(nodes: BrainNode[], settings: CerebroMyceliumSettings): void {
  for (const node of nodes) {
    const pinned = settings.pinnedNodePositions[node.id];
    if (!pinned) continue;
    node._baseX = round(clamp(pinned.x, 0.04, 0.96));
    node._baseY = round(clamp(pinned.y, 0.06, 0.94));
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
