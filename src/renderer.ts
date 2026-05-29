import { bezier, hexA, importance, makeFilaments, radiusFor, rng, stillness, strHash, type Filament } from "./filaments.ts";
import { prepareRenderableGraph } from "./layout.ts";
import { formatRecency } from "./recency.ts";
import { DEFAULT_SETTINGS, type CerebroMyceliumSettings, type PinnedNodePosition } from "./settings.ts";
import type { BrainEdge, BrainGraph, BrainNode } from "./types.ts";

interface Spore {
  edgeIdx: number;
  t: number;
  speed: number;
  dir: 1 | -1;
  size: number;
}

interface BloomSignal {
  filIdx: number;
  born: number;
  dir: 1 | -1;
  color: string;
}

interface Shockwave {
  x: number;
  y: number;
  born: number;
  life: number;
  color: string;
}

interface Cascade {
  rootId: string;
  born: number;
  hops: Record<string, number>;
}

interface DragState {
  startX: number;
  startY: number;
  startLocalX: number;
  startLocalY: number;
  panX: number;
  panY: number;
  mode: "pan" | "node";
  nodeId?: string;
  nodeStartX?: number;
  nodeStartY?: number;
  latestPosition?: PinnedNodePosition;
  moved: boolean;
  pointerId: number;
}

interface Point {
  x: number;
  y: number;
}

export interface FocusSummary {
  node: BrainNode;
  links: number;
  weight: number;
  recencyText: string;
  reach: [number, number, number, number];
}

export interface HoverOverlay {
  node: BrainNode;
  x: number;
  y: number;
}

export interface MyceliumRendererOptions {
  settings: CerebroMyceliumSettings;
  onChange?: () => void;
  onOpenNode?: (node: BrainNode) => void;
  onPinNode?: (node: BrainNode, position: PinnedNodePosition) => void;
}

const HOP_DELAY = 160;
const HOP_RISE = 280;
const BLOOM_MS = 850;

export class MyceliumRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private getGraph: (() => BrainGraph) | null = null;
  private options: MyceliumRendererOptions = { settings: DEFAULT_SETTINGS };
  private raf: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private panX = 0;
  private panY = 0;
  private zoom = 1;
  private drag: DragState | null = null;
  private lastT = performance.now();
  private hoverId: string | null = null;
  private focusId: string | null = null;
  private lastBloomAt = 0;
  private displayGraph: BrainGraph | null = null;
  private filaments: Filament[] = [];
  private spores: Spore[] = [];
  private blooms: BloomSignal[] = [];
  private shockwaves: Shockwave[] = [];
  private cascade: Cascade | null = null;
  private focusFade = 0;
  private cacheKey = "";

  start(canvas: HTMLCanvasElement, getGraph: () => BrainGraph, options: Partial<MyceliumRendererOptions> = {}): void {
    this.stop();
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Cerebro Mycelium requires Canvas 2D support.");
    this.canvas = canvas;
    this.ctx = ctx;
    this.getGraph = getGraph;
    this.options = { ...this.options, ...options, settings: options.settings ?? this.options.settings };
    this.lastT = performance.now();

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("keydown", this.onKeyDown);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.draw);
  }

  stop(): void {
    if (this.raf != null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerUp);
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
      this.canvas.removeEventListener("wheel", this.onWheel);
      this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    }
    window.removeEventListener("keydown", this.onKeyDown);
    this.canvas = null;
    this.ctx = null;
    this.getGraph = null;
    this.drag = null;
  }

  setOptions(options: Partial<MyceliumRendererOptions>): void {
    const nextSettings = options.settings ?? this.options.settings;
    if (nextSettings !== this.options.settings) this.cacheKey = "";
    this.options = { ...this.options, ...options, settings: nextSettings };
  }

  invalidate(): void {
    this.cacheKey = "";
  }

  getHoveredNode(): BrainNode | null {
    const graph = this.displayGraph;
    return this.hoverId && graph ? graph.idx[this.hoverId] ?? null : null;
  }

  getFocusedNode(): BrainNode | null {
    const graph = this.displayGraph;
    return this.focusId && graph ? graph.idx[this.focusId] ?? null : null;
  }

  getHoverOverlay(): HoverOverlay | null {
    const node = this.getHoveredNode();
    if (!node) return null;
    const [x, y] = this.localPos(node, performance.now());
    return { node, ...this.toScreen({ x, y }) };
  }

  getFocusSummary(): FocusSummary | null {
    const graph = this.displayGraph;
    const node = this.focusId && graph ? graph.idx[this.focusId] ?? null : null;
    if (!graph || !node || node._micro) return null;
    const reach: [number, number, number, number] = [0, 0, 0, 0];
    const hops = this.cascade?.hops ?? { [node.id]: 0 };
    for (const id of Object.keys(hops)) {
      const hop = hops[id];
      if (hop >= 0 && hop < reach.length && !graph.idx[id]?._micro) reach[hop] += 1;
    }
    return {
      node,
      links: (graph.adj[node.id] ?? []).filter((id) => !graph.idx[id]?._micro).length,
      weight: importance(node),
      recencyText: formatRecency(node.recencyHours),
      reach
    };
  }

  clearFocus(): void {
    this.focusId = null;
    this.cascade = null;
    this.options.onChange?.();
  }

  hitTest(x: number, y: number): BrainNode | null {
    return this.findAt(this.toLocal({ x, y }));
  }

  private draw = (now: number): void => {
    const ctx = this.ctx;
    const graph = this.ensureRenderableGraph();
    if (!ctx || !graph) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;

    const pal = graph.activePalette;
    this.focusFade += ((this.focusId ? 1 : 0) - this.focusFade) * Math.min(1, dt * 6);

    const bg = ctx.createRadialGradient(this.width * 0.5, this.height * 0.5, 0, this.width * 0.5, this.height * 0.5, Math.max(this.width, this.height) * 0.82);
    bg.addColorStop(0, pal.bg);
    bg.addColorStop(0.7, pal.bg);
    bg.addColorStop(1, pal.bgFar);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawSubstrate(ctx, now);

    ctx.save();
    this.applySceneTransform(ctx);
    if (this.options.settings.showClusterHaze) this.drawClusterHaze(ctx, graph, now);
    this.drawFilaments(ctx, graph, now);
    this.drawSpores(ctx, dt);
    this.drawBloomSignals(ctx, now);
    this.drawShockwaves(ctx, now);
    this.drawNodes(ctx, graph, now);
    this.drawLabels(ctx, graph, now);
    ctx.restore();

    this.raf = requestAnimationFrame(this.draw);
  };

  private ensureRenderableGraph(): BrainGraph | null {
    const source = this.getGraph?.();
    if (!source) return null;
    const settings = this.options.settings;
    const key = `${source.rev ?? "graph"}:${this.width}:${this.height}:${settings.showDecorativeMicroLeaves}:${settings.sporeDensity}:${pinKey(settings.pinnedNodePositions)}`;
    if (key === this.cacheKey && this.displayGraph) return this.displayGraph;

    const graph = prepareRenderableGraph(source, settings);
    this.displayGraph = graph;
    this.filaments = makeFilaments(graph, this.width, this.height);
    this.seedSpores(graph);
    if (this.focusId && !graph.idx[this.focusId]) this.clearFocus();
    if (this.hoverId && !graph.idx[this.hoverId]) this.hoverId = null;
    this.cacheKey = key;
    return graph;
  }

  private seedSpores(graph: BrainGraph): void {
    const sorted = graph.edges
      .map((edge, edgeIdx) => ({ edgeIdx, edge, micro: !!(graph.idx[edge.a]?._micro || graph.idx[edge.b]?._micro) }))
      .filter((item) => !item.micro)
      .map((item) => ({
        edgeIdx: item.edgeIdx,
        weight: (importance(graph.idx[item.edge.a]) + importance(graph.idx[item.edge.b])) / 2
      }))
      .sort((a, b) => b.weight - a.weight || a.edgeIdx - b.edgeIdx);

    const count = Math.ceil(sorted.length * (this.options.settings.sporeDensity / 100));
    this.spores = sorted.slice(0, count).map((item) => {
      const random = rng(strHash(`spore:${graph.edges[item.edgeIdx].a}:${graph.edges[item.edgeIdx].b}`));
      return {
        edgeIdx: item.edgeIdx,
        t: random(),
        speed: 0.018 + random() * 0.022,
        dir: random() < 0.5 ? 1 : -1,
        size: 0.7 + random() * 0.6
      };
    });
  }

  private drawSubstrate(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = 0; i < 90; i += 1) {
      const sx = (((i * 71) % 100) / 100) * this.width;
      const sy = (((i * 137) % 100) / 100) * this.height;
      const alpha = Math.max(0, 0.05 + 0.15 * Math.sin(now / 1100 + i));
      ctx.fillStyle = `rgba(220,210,190,${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawClusterHaze(ctx: CanvasRenderingContext2D, graph: BrainGraph, now: number): void {
    ctx.globalCompositeOperation = "lighter";
    for (const node of graph.nodes) {
      if (node._micro || importance(node) < 6) continue;
      const [sx, sy] = this.localPos(node, now);
      const radius = 60 + importance(node) * 6;
      const haze = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
      haze.addColorStop(0, hexA(node.color, 0.07 * graph.CHAOS.bloom));
      haze.addColorStop(0.5, hexA(node.color, 0.025 * graph.CHAOS.bloom));
      haze.addColorStop(1, hexA(node.color, 0));
      ctx.fillStyle = haze;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private drawFilaments(ctx: CanvasRenderingContext2D, graph: BrainGraph, now: number): void {
    const focusAdj = this.focusId ? new Set([this.focusId, ...(graph.adj[this.focusId] ?? [])]) : null;
    const hoverAdj = this.hoverId ? new Set([this.hoverId, ...(graph.adj[this.hoverId] ?? [])]) : null;
    const pos = this.nodePositions(graph, now);

    for (let i = 0; i < this.filaments.length; i += 1) {
      const filament = this.filaments[i];
      const edge = graph.edges[filament.edgeIdx];
      const a = graph.idx[edge.a];
      const b = graph.idx[edge.b];
      if (!a || !b) continue;
      const [ax, ay] = pos[edge.a];
      const [bx, by] = pos[edge.b];
      const baseAx = (a._baseX ?? 0.5) * this.width;
      const baseAy = (a._baseY ?? 0.5) * this.height;
      const baseBx = (b._baseX ?? 0.5) * this.width;
      const baseBy = (b._baseY ?? 0.5) * this.height;
      const c1x = filament.p1[0] + (ax - baseAx) * (2 / 3);
      const c1y = filament.p1[1] + (ay - baseAy) * (2 / 3);
      const c2x = filament.p2[0] + (bx - baseBx) * (2 / 3);
      const c2y = filament.p2[1] + (by - baseBy) * (2 / 3);
      const isFocus = focusAdj ? edge.a === this.focusId || edge.b === this.focusId : false;
      const isHover = hoverAdj ? edge.a === this.hoverId || edge.b === this.hoverId : false;
      const dim = Math.min(this.offFocusDim(edge.a), this.offFocusDim(edge.b));

      if (filament.microEdge) {
        ctx.strokeStyle = `rgba(180,165,140,${(isFocus ? 0.55 : isHover ? 0.35 : 0.13) * dim})`;
        ctx.lineWidth = 0.45;
      } else {
        const alpha = isFocus ? 0.65 : isHover ? 0.45 : 0.2;
        const strandAlpha = alpha * (0.7 + 0.3 * (filament.fibreIdx / Math.max(1, filament.fibres - 1))) * dim;
        ctx.strokeStyle = `rgba(170,148,120,${strandAlpha})`;
        ctx.lineWidth = 0.55 + (filament.weight >= 8 ? 0.3 : 0);
      }
      this.strokeCurve(ctx, ax, ay, c1x, c1y, c2x, c2y, bx, by);

      this.drawCascadeFilament(ctx, graph, edge, filament, ax, ay, c1x, c1y, c2x, c2y, bx, by, now);
      if (isFocus || isHover) {
        const gradient = ctx.createLinearGradient(ax, ay, bx, by);
        gradient.addColorStop(0, hexA(a.color, isFocus ? 0.45 : 0.22));
        gradient.addColorStop(1, hexA(b.color, isFocus ? 0.45 : 0.22));
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 0.55;
        this.strokeCurve(ctx, ax, ay, c1x, c1y, c2x, c2y, bx, by);
      }
    }
  }

  private drawCascadeFilament(
    ctx: CanvasRenderingContext2D,
    graph: BrainGraph,
    edge: BrainEdge,
    filament: Filament,
    ax: number,
    ay: number,
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    bx: number,
    by: number,
    now: number
  ): void {
    if (!this.cascade || this.cascade.hops[edge.a] == null || this.cascade.hops[edge.b] == null) return;
    const a = graph.idx[edge.a];
    const b = graph.idx[edge.b];
    if (!a || !b) return;
    const minHop = Math.min(this.cascade.hops[edge.a], this.cascade.hops[edge.b]);
    const start = minHop * HOP_DELAY;
    const lit = Math.max(0, Math.min(1, (now - this.cascade.born - start) / HOP_RISE));
    if (lit <= 0.01) return;
    const gradient = ctx.createLinearGradient(ax, ay, bx, by);
    gradient.addColorStop(0, hexA(a.color, 0.55 * lit * this.focusFade));
    gradient.addColorStop(1, hexA(b.color, 0.55 * lit * this.focusFade));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = (filament.microEdge ? 0.7 : 1.1) * (0.6 + 0.4 * lit);
    this.strokeCurve(ctx, ax, ay, c1x, c1y, c2x, c2y, bx, by);
  }

  private drawSpores(ctx: CanvasRenderingContext2D, dt: number): void {
    for (const spore of this.spores) {
      spore.t += spore.speed * spore.dir * dt;
      if (spore.t > 1) spore.t -= 1;
      if (spore.t < 0) spore.t += 1;
      const filament = this.filaments.find((item) => item.edgeIdx === spore.edgeIdx);
      if (!filament) continue;
      const [px, py] = bezier(filament.p0, filament.p1, filament.p2, filament.p3, spore.t);
      ctx.fillStyle = "rgba(230,215,185,0.45)";
      ctx.beginPath();
      ctx.arc(px, py, spore.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBloomSignals(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = this.blooms.length - 1; i >= 0; i -= 1) {
      const bloom = this.blooms[i];
      const t = (now - bloom.born) / BLOOM_MS;
      if (t >= 1) {
        this.blooms.splice(i, 1);
        continue;
      }
      const filament = this.filaments[bloom.filIdx];
      if (!filament) continue;
      const tt = bloom.dir > 0 ? t : 1 - t;
      for (let k = 0; k < 8; k += 1) {
        const ttk = Math.max(0, Math.min(1, tt + (bloom.dir > 0 ? -k * 0.04 : k * 0.04)));
        const [px, py] = bezier(filament.p0, filament.p1, filament.p2, filament.p3, ttk);
        const alpha = (1 - k / 8) * (1 - t) * 0.85;
        ctx.fillStyle = hexA(bloom.color, alpha);
        ctx.beginPath();
        ctx.arc(px, py, 1.8 - k * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawShockwaves(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i -= 1) {
      const wave = this.shockwaves[i];
      const t = (now - wave.born) / wave.life;
      if (t >= 1) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const eased = 1 - (1 - t) ** 3;
      const radius = 14 + eased * 220;
      ctx.strokeStyle = hexA(wave.color, (1 - t) * 0.55);
      ctx.lineWidth = 1.4 * (1 - t * 0.4);
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalCompositeOperation = "lighter";
      const ring = ctx.createRadialGradient(wave.x, wave.y, Math.max(0, radius - 18), wave.x, wave.y, radius + 12);
      ring.addColorStop(0, hexA(wave.color, 0));
      ring.addColorStop(0.5, hexA(wave.color, (1 - t) * 0.22));
      ring.addColorStop(1, hexA(wave.color, 0));
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius + 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
  }

  private drawNodes(ctx: CanvasRenderingContext2D, graph: BrainGraph, now: number): void {
    for (const node of graph.nodes) {
      const [sx, sy] = this.localPos(node, now);
      const isHover = node.id === this.hoverId;
      const isFocus = node.id === this.focusId;
      const lit = this.cascadeLit(node.id, now);
      const litBump = lit > 0 && this.cascade ? 1 + 0.35 * lit * Math.exp(-((now - this.cascade.born) - this.cascade.hops[node.id] * HOP_DELAY) / 400) : 1;
      const baseRadius = radiusFor(node);
      const radius = baseRadius * (isHover ? 1.15 : 1) * (isFocus ? 1.35 : 1) * litBump;
      const dim = (node.status === "archived" ? 0.35 : node.status === "dormantRelevant" ? 0.65 : 1) * this.offFocusDim(node.id);
      const freshness = node._micro ? 0 : node.freshness ?? 0;
      const baseOpacity = 0.55 + 0.45 * freshness;

      if (!node._micro && freshness > 0) this.drawFreshnessHalo(ctx, node, sx, sy, radius, freshness, now, dim);
      if (!node._micro && importance(node) >= 8) this.drawDiffraction(ctx, graph, node, sx, sy, radius, dim);

      ctx.globalCompositeOperation = "lighter";
      const haloRadius = radius * (node._micro ? 2.2 : 3.5) * graph.CHAOS.halo * (1 + lit * 0.6);
      const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloRadius);
      halo.addColorStop(0, hexA(node.color, (node._micro ? 0.25 : 0.5) * dim * graph.CHAOS.bloom * (1 + lit)));
      halo.addColorStop(1, hexA(node.color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, sy, haloRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      ctx.fillStyle = hexA(node.color, 0.95 * dim * baseOpacity);
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255,250,230,${0.95 * dim * baseOpacity})`;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.6, radius * 0.4), 0, Math.PI * 2);
      ctx.fill();

      if ((isHover || isFocus) && !node._micro) {
        ctx.strokeStyle = hexA(node.color, isFocus ? 0.9 : 0.55);
        ctx.lineWidth = isFocus ? 1.3 : 0.8;
        ctx.beginPath();
        ctx.arc(sx, sy, radius + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawFreshnessHalo(
    ctx: CanvasRenderingContext2D,
    node: BrainNode,
    sx: number,
    sy: number,
    radius: number,
    freshness: number,
    now: number,
    dim: number
  ): void {
    ctx.globalCompositeOperation = "lighter";
    const haloRadius = radius * (5 + freshness * 7);
    const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloRadius);
    halo.addColorStop(0, hexA(node.color, 0.18 * freshness * dim));
    halo.addColorStop(0.55, hexA(node.color, 0.08 * freshness * dim));
    halo.addColorStop(1, hexA(node.color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sx, sy, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    const pulse = (now / 1400) % 1;
    ctx.strokeStyle = hexA(node.color, (1 - pulse) * 0.26 * freshness * dim);
    ctx.lineWidth = 1.1 * (1 - pulse * 0.4);
    ctx.beginPath();
    ctx.arc(sx, sy, radius + 7 + pulse * 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  private drawDiffraction(ctx: CanvasRenderingContext2D, graph: BrainGraph, node: BrainNode, sx: number, sy: number, radius: number, dim: number): void {
    const spikeRadius = radius * 6 * graph.CHAOS.halo;
    const spike = ctx.createRadialGradient(sx, sy, 0, sx, sy, spikeRadius);
    spike.addColorStop(0, hexA(node.color, 0.65 * dim));
    spike.addColorStop(1, hexA(node.color, 0));
    ctx.strokeStyle = spike;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(sx - spikeRadius, sy);
    ctx.lineTo(sx + spikeRadius, sy);
    ctx.moveTo(sx, sy - spikeRadius);
    ctx.lineTo(sx, sy + spikeRadius);
    ctx.stroke();
  }

  private drawLabels(ctx: CanvasRenderingContext2D, graph: BrainGraph, now: number): void {
    const labels = new Set<string>();
    if (this.hoverId) labels.add(this.hoverId);
    if (this.focusId) labels.add(this.focusId);
    if (this.cascade) {
      for (const id of Object.keys(this.cascade.hops)) labels.add(id);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const node of graph.nodes) {
      if (!labels.has(node.id) || node._micro || !node.name) continue;
      const [sx, sy] = this.localPos(node, now);
      const radius = radiusFor(node);
      const isPrimary = importance(node) >= 8;
      const fontPx = isPrimary ? 12 : 10.5;
      ctx.font = `${isPrimary ? 600 : 500} ${fontPx}px var(--font-interface), system-ui, sans-serif`;
      const width = ctx.measureText(node.name).width;
      ctx.fillStyle = "rgba(0,0,0,0.58)";
      ctx.fillRect(sx - width / 2 - 5, sy + radius + 6, width + 10, fontPx + 4);
      ctx.fillStyle = node.id === this.focusId ? "#fff5dc" : hexA(node.color, 0.9);
      ctx.fillText(node.name, sx, sy + radius + 7);
    }
  }

  private strokeCurve(
    ctx: CanvasRenderingContext2D,
    ax: number,
    ay: number,
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    bx: number,
    by: number
  ): void {
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, bx, by);
    ctx.stroke();
  }

  private triggerBloom(nodeId: string): void {
    const graph = this.displayGraph;
    if (!graph) return;
    const node = graph.idx[nodeId];
    if (!node) return;
    const now = performance.now();
    this.filaments.forEach((filament, filIdx) => {
      const edge = graph.edges[filament.edgeIdx];
      if (edge.a === nodeId) this.blooms.push({ filIdx, born: now, dir: 1, color: node.color });
      if (edge.b === nodeId) this.blooms.push({ filIdx, born: now, dir: -1, color: node.color });
    });
  }

  private triggerCascade(nodeId: string, x: number, y: number): void {
    const graph = this.displayGraph;
    if (!graph) return;
    this.cascade = { rootId: nodeId, born: performance.now(), hops: this.computeHops(graph, nodeId, 3) };
    this.shockwaves.push({
      x,
      y,
      born: performance.now(),
      life: 900,
      color: graph.idx[nodeId]?.color ?? "#ffffff"
    });
  }

  private computeHops(graph: BrainGraph, rootId: string, maxHops: number): Record<string, number> {
    const hops: Record<string, number> = { [rootId]: 0 };
    let frontier = [rootId];
    for (let d = 1; d <= maxHops; d += 1) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const nid of graph.adj[id] ?? []) {
          if (hops[nid] != null) continue;
          hops[nid] = d;
          next.push(nid);
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    return hops;
  }

  private cascadeLit(id: string, now: number): number {
    if (!this.cascade) return 0;
    const hop = this.cascade.hops[id];
    if (hop == null) return 0;
    const start = hop * HOP_DELAY;
    const elapsed = now - this.cascade.born;
    if (elapsed < start) return 0;
    return Math.min(1, (elapsed - start) / HOP_RISE);
  }

  private offFocusDim(id: string): number {
    if (!this.cascade || this.focusFade < 0.01) return 1;
    if (this.cascade.hops[id] != null) return 1;
    return 1 - this.focusFade * 0.65;
  }

  private nodePositions(graph: BrainGraph, now: number): Record<string, [number, number]> {
    const out: Record<string, [number, number]> = {};
    for (const node of graph.nodes) out[node.id] = this.localPos(node, now);
    return out;
  }

  private localPos(node: BrainNode, now: number): [number, number] {
    const seconds = now / 1000;
    const drift = stillness(node) * (node._micro ? 0.01 : 0.005);
    const x = (node._baseX ?? 0.5) + Math.sin(seconds * 0.4 + (node._wphase ?? 0)) * drift;
    const y = (node._baseY ?? 0.5) + Math.cos(seconds * 0.35 + (node._wphase ?? 0)) * drift;
    return [x * this.width, y * this.height];
  }

  private findAt(point: Point): BrainNode | null {
    const graph = this.displayGraph;
    if (!graph) return null;
    const now = performance.now();
    let best: BrainNode | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const node of graph.nodes) {
      if (node._micro) continue;
      const [sx, sy] = this.localPos(node, now);
      const d = Math.hypot(point.x - sx, point.y - sy);
      const radius = radiusFor(node);
      const tolerance = Math.max(14, radius + 10);
      const score = d - radius * 0.8;
      if (d < tolerance && score < bestScore) {
        best = node;
        bestScore = score;
      }
    }
    return best;
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.canvas || event.button !== 0) return;
    this.ensureRenderableGraph();
    const rect = this.canvas.getBoundingClientRect();
    const local = this.toLocal({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    const hit = this.findAt(local);
    this.canvas.setPointerCapture(event.pointerId);
    this.drag = {
      startX: event.clientX,
      startY: event.clientY,
      startLocalX: local.x,
      startLocalY: local.y,
      panX: this.panX,
      panY: this.panY,
      mode: hit ? "node" : "pan",
      nodeId: hit?.id,
      nodeStartX: hit?._baseX,
      nodeStartY: hit?._baseY,
      moved: false,
      pointerId: event.pointerId
    };
    this.canvas.style.cursor = hit ? "grabbing" : "grab";
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.canvas) return;
    if (this.drag) {
      const dx = event.clientX - this.drag.startX;
      const dy = event.clientY - this.drag.startY;
      this.drag.moved = this.drag.moved || Math.hypot(dx, dy) > 3;
      if (this.drag.mode === "node" && this.drag.nodeId) {
        const rect = this.canvas.getBoundingClientRect();
        const local = this.toLocal({ x: event.clientX - rect.left, y: event.clientY - rect.top });
        const next = {
          x: clampNormalizedX((this.drag.nodeStartX ?? 0.5) + (local.x - this.drag.startLocalX) / this.width),
          y: clampNormalizedY((this.drag.nodeStartY ?? 0.5) + (local.y - this.drag.startLocalY) / this.height)
        };
        this.drag.latestPosition = next;
        this.moveNodeTo(this.drag.nodeId, next);
      } else {
        this.panX = this.drag.panX + dx;
        this.panY = this.drag.panY + dy;
      }
      this.options.onChange?.();
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const hit = this.findAt(this.toLocal({ x: event.clientX - rect.left, y: event.clientY - rect.top }));
    const nextHover = hit?.id ?? null;
    if (nextHover !== this.hoverId) {
      this.hoverId = nextHover;
      if (hit) {
        const now = performance.now();
        if (now - this.lastBloomAt > 220) {
          this.triggerBloom(hit.id);
          this.lastBloomAt = now;
        }
      }
      this.canvas.style.cursor = hit ? "pointer" : this.drag ? "grabbing" : "grab";
      this.options.onChange?.();
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.canvas || !this.drag) return;
    const activeDrag = this.drag;
    const wasClick = !activeDrag.moved;
    try {
      this.canvas.releasePointerCapture(activeDrag.pointerId);
    } catch {
      // Pointer capture may already be gone if Obsidian changed panes.
    }
    this.drag = null;
    this.canvas.style.cursor = this.hoverId ? "pointer" : "grab";
    if (activeDrag.mode === "node" && activeDrag.moved && activeDrag.nodeId && activeDrag.latestPosition) {
      const graph = this.displayGraph;
      const node = graph?.idx[activeDrag.nodeId];
      if (node) this.options.onPinNode?.(node, activeDrag.latestPosition);
      return;
    }
    if (!wasClick) return;

    const rect = this.canvas.getBoundingClientRect();
    this.handleClick(this.toLocal({ x: event.clientX - rect.left, y: event.clientY - rect.top }));
  };

  private onPointerLeave = (): void => {
    if (this.drag) return;
    if (this.hoverId) {
      this.hoverId = null;
      this.options.onChange?.();
    }
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.canvas?.getBoundingClientRect();
    if (!rect) return;
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const local = this.toLocal(point);
    const nextZoom = Math.max(0.45, Math.min(3, this.zoom * (event.deltaY > 0 ? 0.92 : 1.08)));
    this.zoom = nextZoom;
    this.panX = point.x - (local.x - this.width / 2) * this.zoom - this.width / 2;
    this.panY = point.y - (local.y - this.height / 2) * this.zoom - this.height / 2;
    this.options.onChange?.();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.focusId) this.clearFocus();
  };

  private onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private moveNodeTo(nodeId: string, position: PinnedNodePosition): void {
    const graph = this.displayGraph;
    if (!graph) return;
    const node = graph.idx[nodeId];
    if (!node || node._micro) return;
    const previousX = node._baseX ?? position.x;
    const previousY = node._baseY ?? position.y;
    const dx = position.x - previousX;
    const dy = position.y - previousY;
    node._baseX = position.x;
    node._baseY = position.y;
    for (const child of graph.nodes) {
      if (child.parentId !== nodeId) continue;
      child._baseX = clamp((child._baseX ?? position.x) + dx, 0.03, 0.97);
      child._baseY = clamp((child._baseY ?? position.y) + dy, 0.04, 0.96);
    }
    this.filaments = makeFilaments(graph, this.width, this.height);
  }

  private handleClick(point: Point): void {
    const hit = this.findAt(point);
    if (!hit) {
      if (this.focusId) {
        const focused = this.getFocusedNode();
        if (focused) {
          const [x, y] = this.localPos(focused, performance.now());
          this.shockwaves.push({ x, y, born: performance.now(), life: 700, color: focused.color });
        }
      }
      this.clearFocus();
      return;
    }

    if (this.options.settings.clickBehaviour === "single-click-open" || this.focusId === hit.id) {
      this.options.onOpenNode?.(hit);
      return;
    }

    this.focusId = hit.id;
    this.triggerBloom(hit.id);
    this.triggerCascade(hit.id, point.x, point.y);
    this.options.onChange?.();
  }

  private resize(): void {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cacheKey = "";
  }

  private applySceneTransform(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.width / 2 + this.panX, this.height / 2 + this.panY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.width / 2, -this.height / 2);
  }

  private toLocal(point: Point): Point {
    return {
      x: (point.x - this.panX - this.width / 2) / this.zoom + this.width / 2,
      y: (point.y - this.panY - this.height / 2) / this.zoom + this.height / 2
    };
  }

  private toScreen(point: Point): Point {
    return {
      x: (point.x - this.width / 2) * this.zoom + this.width / 2 + this.panX,
      y: (point.y - this.height / 2) * this.zoom + this.height / 2 + this.panY
    };
  }
}

function pinKey(positions: Record<string, PinnedNodePosition>): string {
  return Object.entries(positions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, position]) => `${path}:${position.x.toFixed(4)},${position.y.toFixed(4)}`)
    .join("|");
}

function clampNormalizedX(value: number): number {
  return clamp(value, 0.04, 0.96);
}

function clampNormalizedY(value: number): number {
  return clamp(value, 0.06, 0.94);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
