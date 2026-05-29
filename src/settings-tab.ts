import { PluginSettingTab, Setting } from "obsidian";
import type CerebroMyceliumPlugin from "../main.ts";
import { PALETTES } from "./palette.ts";
import type { CerebroMyceliumSettings, ClickBehaviour, PaletteName } from "./settings.ts";

export class CerebroMyceliumSettingTab extends PluginSettingTab {
  plugin: CerebroMyceliumPlugin;

  constructor(plugin: CerebroMyceliumPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName("Cerebro Mycelium")
      .setHeading();

    new Setting(containerEl)
      .setName("Theme palette")
      .setDesc("Color palette used by the mycelium renderer.")
      .addDropdown((dropdown) => {
        for (const key of Object.keys(PALETTES)) dropdown.addOption(key, PALETTES[key].label);
        dropdown.setValue(this.plugin.settings.palette);
        dropdown.onChange((value) => this.update({ palette: value as PaletteName }));
      });

    new Setting(containerEl)
      .setName("Recency window")
      .setDesc("Hours after modification that a note keeps a fruiting-body glow.")
      .addSlider((slider) => slider
        .setLimits(1, 168, 1)
        .setValue(this.plugin.settings.recencyWindowHours)
        .setDynamicTooltip()
        .onChange((value) => this.update({ recencyWindowHours: value })));

    new Setting(containerEl)
      .setName("Spore density")
      .setDesc("Percent of strongest real links that carry drifting spores.")
      .addSlider((slider) => slider
        .setLimits(0, 100, 5)
        .setValue(this.plugin.settings.sporeDensity)
        .setDynamicTooltip()
        .onChange((value) => this.update({ sporeDensity: value })));

    new Setting(containerEl)
      .setName("Cluster haze")
      .setDesc("Draw soft radial haze behind dense clusters.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showClusterHaze)
        .onChange((value) => this.update({ showClusterHaze: value })));

    new Setting(containerEl)
      .setName("Decorative micro-leaves")
      .setDesc("Add tiny procedural leaves around hubs for a denser fungal field.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showDecorativeMicroLeaves)
        .onChange((value) => this.update({ showDecorativeMicroLeaves: value })));

    new Setting(containerEl)
      .setName("Pause when hidden")
      .setDesc("Stop animation while the view is hidden.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.pauseAnimationWhenHidden)
        .onChange((value) => this.update({ pauseAnimationWhenHidden: value })));

    new Setting(containerEl)
      .setName("Click behavior")
      .setDesc("Choose whether the first click focuses a note or opens it immediately.")
      .addDropdown((dropdown) => dropdown
        .addOption("focus-then-open", "Focus, then open")
        .addOption("single-click-open", "Open immediately")
        .setValue(this.plugin.settings.clickBehaviour)
        .onChange((value) => this.update({ clickBehaviour: value as ClickBehaviour })));

    new Setting(containerEl)
      .setName("Pinned positions")
      .setDesc(`${Object.keys(this.plugin.settings.pinnedNodePositions).length} nodes pinned by dragging.`)
      .addButton((button) => button
        .setButtonText("Reset")
        .onClick(() => this.update({ pinnedNodePositions: {} })));

    new Setting(containerEl)
      .setName("Performance")
      .setHeading();

    new Setting(containerEl)
      .setName("Node cap")
      .setDesc("Maximum visible notes. Lowest-degree notes are dropped first.")
      .addSlider((slider) => slider
        .setLimits(200, 10000, 100)
        .setValue(this.plugin.settings.nodeCap)
        .setDynamicTooltip()
        .onChange((value) => this.update({ nodeCap: value })));

    new Setting(containerEl)
      .setName("Edge cap")
      .setDesc("Maximum rendered wikilinks.")
      .addSlider((slider) => slider
        .setLimits(200, 20000, 100)
        .setValue(this.plugin.settings.edgeCap)
        .setDynamicTooltip()
        .onChange((value) => this.update({ edgeCap: value })));

    new Setting(containerEl)
      .setName("Hub threshold")
      .setDesc("Top percentile of linked notes that should render as hubs.")
      .addSlider((slider) => slider
        .setLimits(1, 20, 1)
        .setValue(this.plugin.settings.hubThresholdPercent)
        .setDynamicTooltip()
        .onChange((value) => this.update({ hubThresholdPercent: value })));

    new Setting(containerEl)
      .setName("Classification")
      .setHeading();

    new Setting(containerEl)
      .setName("Frontmatter kind keys")
      .setDesc("Comma-separated frontmatter fields checked for kind/type/category.")
      .addText((text) => text
        .setValue(this.plugin.settings.frontmatterKindKeys.join(", "))
        .onChange((value) => this.update({
          frontmatterKindKeys: value.split(",").map((item) => item.trim()).filter(Boolean)
        })));
  }

  private async update(patch: Partial<CerebroMyceliumSettings>): Promise<void> {
    this.plugin.settings = { ...this.plugin.settings, ...patch };
    await this.plugin.saveSettings();
    this.plugin.refreshActiveMyceliumViews();
  }
}
