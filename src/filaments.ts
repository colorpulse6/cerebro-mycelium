import type { BrainGraph, BrainNode } from "./types.ts";

export type BezierPoint = [number, number];

export interface Filament {
  edgeIdx: number;
  fibreIdx: number;
  fibres: number;
  p0: BezierPoint;
  p1: BezierPoint;
  p2: BezierPoint;
  p3: BezierPoint;
  weight: number;
  microEdge: boolean;
}

export function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return `rgba(255,245,220,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function bezier(p0: BezierPoint, p1: BezierPoint, p2: BezierPoint, p3: BezierPoint, t: number): BezierPoint {
  const mt = 1 - t;
  const x = mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0];
  const y = mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1];
  return [x, y];
}

export function importance(node: BrainNode): number {
  return (node.degree || 0) + (node.hub ? 6 : 0);
}

export function radiusFor(node: BrainNode): number {
  if (node._micro) return 1.4 + ((strHash(node.id) % 1000) / 1000) * 0.4;
  return 2 + Math.sqrt(importance(node)) * 2.2;
}

export function stillness(node: BrainNode): number {
  if (node._micro) return 1;
  return Math.max(0, 1 - importance(node) * 0.1);
}

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function strHash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeFilaments(graph: BrainGraph, width: number, height: number): Filament[] {
  const out: Filament[] = [];
  for (let edgeIdx = 0; edgeIdx < graph.edges.length; edgeIdx += 1) {
    const edge = graph.edges[edgeIdx];
    const a = graph.idx[edge.a];
    const b = graph.idx[edge.b];
    if (!a || !b) continue;

    const ax = (a._baseX ?? 0.5) * width;
    const ay = (a._baseY ?? 0.5) * height;
    const bx = (b._baseX ?? 0.5) * width;
    const by = (b._baseY ?? 0.5) * height;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const microEdge = !!(a._micro || b._micro);
    const weight = (importance(a) + importance(b)) / 2;
    const fibres = microEdge ? 1 : weight >= 8 ? 3 : weight >= 4 ? 2 : 1;
    const baseBow = (((strHash(edge.a + edge.b) % 1000) / 1000) - 0.5) * 0.5 * len;

    for (let fibreIdx = 0; fibreIdx < fibres; fibreIdx += 1) {
      const random = rng(strHash(`${edge.a}:${edge.b}:${fibreIdx}`));
      const jitter = (fibreIdx - (fibres - 1) / 2) * 1.6 + (random() - 0.5) * 0.8;
      const bow = baseBow * (0.6 + random() * 0.8) + jitter * 4;
      out.push({
        edgeIdx,
        fibreIdx,
        fibres,
        p0: [ax + nx * jitter * 0.5, ay + ny * jitter * 0.5],
        p1: [ax + dx * (0.28 + random() * 0.08) + nx * bow, ay + dy * (0.28 + random() * 0.08) + ny * bow],
        p2: [ax + dx * (0.62 + random() * 0.08) + nx * bow * 0.55, ay + dy * (0.62 + random() * 0.08) + ny * bow * 0.55],
        p3: [bx + nx * jitter * 0.5, by + ny * jitter * 0.5],
        weight,
        microEdge
      });
    }
  }
  return out;
}
