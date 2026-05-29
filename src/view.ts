import { App, ItemView, TFile, WorkspaceLeaf } from "obsidian";
import { buildGraph } from "./adapter.ts";
import { PALETTES, CHAOS, KIND_LABEL } from "./palette.ts";
import { MyceliumRenderer } from "./renderer.ts";
import type { CerebroMyceliumSettings, PinnedNodePosition } from "./settings.ts";
import type { BrainGraph, BrainNode } from "./types.ts";

export const CEREBRO_MYCELIUM_VIEW_TYPE = "cerebro-mycelium";

export interface CerebroMyceliumPluginHost {
  app: App;
  settings: CerebroMyceliumSettings;
  saveSettings(): Promise<void>;
  refreshActiveMyceliumViews(): void;
}

export class CerebroMyceliumView extends ItemView {
  private plugin: CerebroMyceliumPluginHost;
  private renderer = new MyceliumRenderer();
  private graph: BrainGraph | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private statsEl: HTMLSpanElement | null = null;
  private tooltipEl: HTMLDivElement | null = null;
  private focusEl: HTMLDivElement | null = null;
  private emptyEl: HTMLDivElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CerebroMyceliumPluginHost) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CEREBRO_MYCELIUM_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Cerebro Mycelium";
  }

  getIcon(): string {
    return "network";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("cerebro-mycelium-view");

    const root = this.contentEl.createDiv({ cls: "cerebro-mycelium-root" });
    this.canvas = root.createEl("canvas", { cls: "cerebro-mycelium-canvas" });
    this.createHud(root);
    this.tooltipEl = root.createDiv({ cls: "cerebro-mycelium-tooltip" });
    this.focusEl = root.createDiv({ cls: "cerebro-mycelium-focus-card" });
    this.emptyEl = root.createDiv({ cls: "cerebro-mycelium-empty" });
    this.emptyEl.setText("No markdown notes found in this vault.");

    this.rebuild();
    this.startRenderer();
  }

  async onClose(): Promise<void> {
    this.renderer.stop();
    this.graph = null;
  }

  onShow(): void {
    if (this.canvas) this.startRenderer();
  }

  onHide(): void {
    if (this.plugin.settings.pauseAnimationWhenHidden) this.renderer.stop();
  }

  rebuild(): void {
    this.graph = buildGraph(this.plugin.app, this.plugin.settings);
    this.renderer.setOptions({
      settings: this.plugin.settings,
      onChange: this.syncOverlays,
      onOpenNode: (node) => this.openNode(node),
      onPinNode: (node, position) => this.pinNode(node, position)
    });
    this.renderer.invalidate();
    this.syncOverlays();
  }

  private startRenderer(): void {
    if (!this.canvas) return;
    this.renderer.start(this.canvas, () => this.graph ?? emptyGraph(this.plugin.settings), {
      settings: this.plugin.settings,
      onChange: this.syncOverlays,
      onOpenNode: (node) => this.openNode(node),
      onPinNode: (node, position) => this.pinNode(node, position)
    });
  }

  private createHud(root: HTMLElement): void {
    const hud = root.createDiv({ cls: "cerebro-mycelium-hud" });
    hud.createSpan({ cls: "cerebro-mycelium-pulse" });
    hud.createSpan({ text: "CEREBRO - MYCELIUM" });
    hud.createSpan({ cls: "cerebro-mycelium-muted", text: " -" });
    this.statsEl = hud.createSpan({ text: " loading" });

    const help = root.createDiv({ cls: "cerebro-mycelium-help" });
    help.setText("DRAG NODE - pin   -   DRAG EMPTY - pan   -   SCROLL - zoom");
  }

  private syncOverlays = (): void => {
    const graph = this.graph;
    if (!graph) return;
    this.syncStats(graph);
    this.syncTooltip();
    this.syncFocusCard();
    this.emptyEl?.toggleClass("is-visible", graph.nodes.length === 0);
  };

  private syncStats(graph: BrainGraph): void {
    if (!this.statsEl) return;
    const fresh = graph.nodes.filter((node) => node.freshness > 0).length;
    this.statsEl.setText(` ${graph.nodes.length} notes - ${graph.edges.length} hyphae - ${fresh} fruiting`);
  }

  private syncTooltip(): void {
    if (!this.tooltipEl) return;
    const hover = this.renderer.getHoverOverlay();
    this.tooltipEl.toggleClass("is-visible", !!hover);
    if (!hover) return;
    this.tooltipEl.empty();
    this.tooltipEl.style.left = `${Math.min(Math.max(hover.x + 14, 12), this.contentEl.clientWidth - 220)}px`;
    this.tooltipEl.style.top = `${Math.min(Math.max(hover.y + 14, 12), this.contentEl.clientHeight - 88)}px`;
    this.tooltipEl.createDiv({ cls: "cerebro-mycelium-tooltip-title", text: hover.node.name });
    this.tooltipEl.createDiv({ cls: "cerebro-mycelium-tooltip-sub", text: `${hover.node.kindLabel} - ${hover.node.degree} links` });
  }

  private syncFocusCard(): void {
    if (!this.focusEl) return;
    const summary = this.renderer.getFocusSummary();
    this.focusEl.toggleClass("is-visible", !!summary);
    if (!summary) return;
    this.focusEl.empty();
    this.focusEl.createDiv({ cls: "cerebro-mycelium-focus-meta", text: `${summary.node.kindLabel} - ${summary.node.status.toUpperCase()}` });
    this.focusEl.createDiv({ cls: "cerebro-mycelium-focus-title", text: summary.node.name });
    const stats = this.focusEl.createDiv({ cls: "cerebro-mycelium-focus-stats" });
    stats.createSpan({ text: `${summary.links} links` });
    stats.createSpan({ text: `weight ${summary.weight}` });
    stats.createSpan({ text: summary.recencyText });
    stats.createSpan({ cls: "cerebro-mycelium-focus-reach", text: `reach 1h:${summary.reach[1]} 2h:${summary.reach[2]} 3h:${summary.reach[3]}` });
    if (this.plugin.settings.clickBehaviour === "focus-then-open") {
      this.focusEl.createDiv({ cls: "cerebro-mycelium-focus-hint", text: "Click again to open note." });
    }
  }

  private openNode(node: BrainNode): void {
    const file = this.plugin.app.vault.getAbstractFileByPath(node.path);
    if (!(file instanceof TFile)) return;
    void this.plugin.app.workspace.getLeaf(false).openFile(file);
  }

  private pinNode(node: BrainNode, position: PinnedNodePosition): void {
    this.plugin.settings = {
      ...this.plugin.settings,
      pinnedNodePositions: {
        ...this.plugin.settings.pinnedNodePositions,
        [node.id]: position
      }
    };
    this.renderer.setOptions({ settings: this.plugin.settings });
    void this.plugin.saveSettings();
  }
}

function emptyGraph(settings: CerebroMyceliumSettings): BrainGraph {
  const palette = PALETTES[settings.palette] ?? PALETTES.wood;
  return {
    nodes: [],
    edges: [],
    idx: {},
    adj: {},
    KIND_LABEL,
    activePalette: palette,
    activePaletteName: settings.palette,
    CHAOS,
    rev: "empty"
  };
}
