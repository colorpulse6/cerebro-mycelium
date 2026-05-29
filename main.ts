import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { normalizeSettings, type CerebroMyceliumSettings } from "./src/settings.ts";
import { CerebroMyceliumSettingTab } from "./src/settings-tab.ts";
import { CEREBRO_MYCELIUM_VIEW_TYPE, CerebroMyceliumView } from "./src/view.ts";

export default class CerebroMyceliumPlugin extends Plugin {
  settings: CerebroMyceliumSettings = normalizeSettings(null);

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());

    this.registerView(CEREBRO_MYCELIUM_VIEW_TYPE, (leaf: WorkspaceLeaf) => new CerebroMyceliumView(leaf, this));
    this.addCommand({
      id: "open-mycelium",
      name: "Open mycelium",
      callback: () => this.activateView()
    });
    this.addCommand({
      id: "reset-pinned-positions",
      name: "Reset pinned positions",
      callback: async () => {
        this.settings = { ...this.settings, pinnedNodePositions: {} };
        await this.saveSettings();
        this.refreshActiveMyceliumViews();
        new Notice("Cerebro Mycelium pinned positions reset.");
      }
    });
    this.addRibbonIcon("network", "Open Cerebro Mycelium", () => this.activateView());
    this.addSettingTab(new CerebroMyceliumSettingTab(this));

    this.registerEvent(this.app.metadataCache.on("resolved", () => this.debouncedRefresh()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.debouncedRefresh()));
    this.registerEvent(this.app.vault.on("create", () => this.debouncedRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.debouncedRefresh()));
    this.registerEvent(this.app.vault.on("rename", () => this.debouncedRefresh()));
    this.registerEvent(this.app.vault.on("modify", () => this.debouncedRefresh()));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async activateView(): Promise<void> {
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: CEREBRO_MYCELIUM_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  refreshActiveMyceliumViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(CEREBRO_MYCELIUM_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof CerebroMyceliumView) view.rebuild();
    }
  }

  private debouncedRefresh = debounce(() => {
    try {
      this.refreshActiveMyceliumViews();
    } catch (error) {
      console.error("Cerebro Mycelium refresh failed", error);
      new Notice("Cerebro Mycelium refresh failed. See console for details.");
    }
  }, 750);
}

function debounce(callback: () => void, delay: number): () => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(callback, delay);
  };
}
