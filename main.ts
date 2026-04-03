import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, HoursCountSettingTab } from "./src/settings";
import { ClockService } from "./src/clockService";
import { PANEL_VIEW_TYPE, HoursCountPanelView } from "./src/panelView";
import type { HoursCountSettings } from "./src/types";

export default class HoursCountPlugin extends Plugin {
	settings: HoursCountSettings;
	private clockService: ClockService;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.clockService = new ClockService(this.app, () => this.settings);

		// Register the sidebar panel view
		this.registerView(
			PANEL_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new HoursCountPanelView(leaf, this)
		);

		// Ribbon icon — opens/focuses the panel
		this.addRibbonIcon("clock", "Hours Count", () => {
			this.activatePanelView();
		});

		// Command: Clock In
		this.addCommand({
			id: "clock-in",
			name: "Clock In",
			callback: async () => {
				const result = await this.clockService.clockIn();
				if (!result.ok) {
					new Notice(`Hours Count: ${result.reason}`);
				}
				this.refreshPanelView();
			},
		});

		// Command: Clock Out
		this.addCommand({
			id: "clock-out",
			name: "Clock Out",
			callback: async () => {
				const result = await this.clockService.clockOut();
				if (!result.ok) {
					new Notice(`Hours Count: ${result.reason}`);
				}
				this.refreshPanelView();
			},
		});

		// Command: Open Panel
		this.addCommand({
			id: "open-panel",
			name: "Open hours panel",
			callback: () => this.activatePanelView(),
		});

		// Restore panel when layout is ready (survives Obsidian restarts)
		this.app.workspace.onLayoutReady(() => {
			this.initPanelView();
		});

		this.addSettingTab(new HoursCountSettingTab(this.app, this));
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(PANEL_VIEW_TYPE);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ---- Panel view management ----

	/** Open panel on startup if it isn't already open. */
	private async initPanelView(): Promise<void> {
		if (this.app.workspace.getLeavesOfType(PANEL_VIEW_TYPE).length > 0) return;
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: PANEL_VIEW_TYPE, active: true });
		}
	}

	/** Open and focus the panel, creating it if needed. */
	async activatePanelView(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(PANEL_VIEW_TYPE);
		if (leaves.length > 0) {
			this.app.workspace.revealLeaf(leaves[0]);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: PANEL_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	/** Tell the panel to refresh after a clock operation. */
	private refreshPanelView(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(PANEL_VIEW_TYPE)) {
			if (leaf.view instanceof HoursCountPanelView) {
				leaf.view.refresh();
			}
		}
	}
}
