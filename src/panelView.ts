import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type HoursCountPlugin from "../main";
import type { MonthStats, WeekStats } from "./types";
import { ClockService } from "./clockService";
import { StatsService } from "./statsService";
import { getAvailableYears } from "./fileResolver";
import {
	formatMinutesToHMM,
	formatMinutesToDecimal,
	MONTH_NAMES,
} from "./timeUtils";

export const PANEL_VIEW_TYPE = "hours-count-panel";

export class HoursCountPanelView extends ItemView {
	private plugin: HoursCountPlugin;
	private clockService: ClockService;
	private statsService: StatsService;

	// Picker state
	private selectedYear: number;
	private selectedMonth: number;

	// Loaded data
	private clockState: "in" | "out" | "unknown" = "unknown";
	private weekStats: WeekStats | null = null;
	private monthStats: MonthStats | null = null;

	private isRefreshing = false;

	constructor(leaf: WorkspaceLeaf, plugin: HoursCountPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.clockService = new ClockService(plugin.app, () => plugin.settings);
		this.statsService = new StatsService(plugin.app, () => plugin.settings);

		const now = new Date();
		this.selectedYear = now.getFullYear();
		this.selectedMonth = now.getMonth() + 1;
	}

	getViewType(): string {
		return PANEL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Hours Count";
	}

	getIcon(): string {
		return "clock";
	}

	async onOpen(): Promise<void> {
		await this.refresh();
	}

	async onClose(): Promise<void> {
		// nothing to tear down
	}

	// ---- Public API (called from main.ts after commands) ----

	async refresh(): Promise<void> {
		if (this.isRefreshing) return;
		this.isRefreshing = true;
		try {
			[this.clockState, this.weekStats, this.monthStats] = await Promise.all([
				this.clockService.getTodayClockState(),
				this.statsService.getThisWeekStats(),
				this.statsService.getMonthStats(this.selectedYear, this.selectedMonth),
			]);
			this.render();
		} finally {
			this.isRefreshing = false;
		}
	}

	// ---- Rendering ----

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("hours-count-panel");

		root.createEl("h4", { text: "Hours Count", cls: "hours-count-heading" });

		this.renderClockButtons(root);
		this.renderPicker(root);
		this.renderWeekSection(root);
		this.renderMonthSection(root);
		this.renderIncompleteCallout(root);
		this.renderRefreshButton(root);
	}

	private renderClockButtons(parent: HTMLElement): void {
		const row = parent.createDiv({ cls: "hours-count-clock-row" });

		const inBtn = row.createEl("button", {
			text: "Clock In",
			cls: "hours-count-btn hours-count-btn-in",
		});
		inBtn.disabled = this.clockState === "in";

		const outBtn = row.createEl("button", {
			text: "Clock Out",
			cls: "hours-count-btn hours-count-btn-out",
		});
		outBtn.disabled = this.clockState !== "in";

		inBtn.addEventListener("click", async () => {
			const result = await this.clockService.clockIn();
			if (!result.ok) new Notice(`Hours Count: ${result.reason}`);
			await this.refresh();
		});

		outBtn.addEventListener("click", async () => {
			const result = await this.clockService.clockOut();
			if (!result.ok) new Notice(`Hours Count: ${result.reason}`);
			await this.refresh();
		});
	}

	private renderPicker(parent: HTMLElement): void {
		const row = parent.createDiv({ cls: "hours-count-picker-row" });

		// Year dropdown
		const yearSelect = row.createEl("select", { cls: "hours-count-select" });
		let years = getAvailableYears(this.plugin.app, this.plugin.settings);
		if (!years.includes(this.selectedYear)) years = [this.selectedYear, ...years];

		for (const y of years) {
			const opt = yearSelect.createEl("option", {
				text: String(y),
				value: String(y),
			});
			if (y === this.selectedYear) opt.selected = true;
		}
		yearSelect.addEventListener("change", async () => {
			this.selectedYear = parseInt(yearSelect.value);
			this.monthStats = await this.statsService.getMonthStats(
				this.selectedYear,
				this.selectedMonth
			);
			this.render();
		});

		// Month dropdown
		const monthSelect = row.createEl("select", { cls: "hours-count-select" });
		MONTH_NAMES.forEach((name, i) => {
			const opt = monthSelect.createEl("option", {
				text: name,
				value: String(i + 1),
			});
			if (i + 1 === this.selectedMonth) opt.selected = true;
		});
		monthSelect.addEventListener("change", async () => {
			this.selectedMonth = parseInt(monthSelect.value);
			this.monthStats = await this.statsService.getMonthStats(
				this.selectedYear,
				this.selectedMonth
			);
			this.render();
		});
	}

	private renderWeekSection(parent: HTMLElement): void {
		const section = parent.createDiv({ cls: "hours-count-section" });
		section.createEl("h5", { text: "This Week" });

		if (!this.weekStats) {
			section.createEl("p", { text: "Loading…" });
			return;
		}

		const grid = section.createDiv({ cls: "hours-count-grid" });
		this.addStatRow(
			grid,
			"Total hours",
			`${formatMinutesToHMM(this.weekStats.totalMinutes)} (${formatMinutesToDecimal(this.weekStats.totalMinutes)} hrs)`
		);
		this.addStatRow(grid, "Days worked", String(this.weekStats.daysWorked));
	}

	private renderMonthSection(parent: HTMLElement): void {
		const section = parent.createDiv({ cls: "hours-count-section" });
		section.createEl("h5", {
			text: `${MONTH_NAMES[this.selectedMonth - 1]} ${this.selectedYear}`,
		});

		if (!this.monthStats) {
			section.createEl("p", { text: "Loading…" });
			return;
		}

		const grid = section.createDiv({ cls: "hours-count-grid" });
		this.addStatRow(
			grid,
			"Total hours",
			`${formatMinutesToHMM(this.monthStats.totalMinutes)} (${formatMinutesToDecimal(this.monthStats.totalMinutes)} hrs)`
		);
		this.addStatRow(grid, "Days worked", String(this.monthStats.daysWorked));
		this.addStatRow(
			grid,
			"Avg hours/day",
			this.monthStats.daysWorked > 0
				? `${formatMinutesToHMM(this.monthStats.averageMinutesPerDay)} (${formatMinutesToDecimal(this.monthStats.averageMinutesPerDay)} hrs)`
				: "—"
		);
	}

	private renderIncompleteCallout(parent: HTMLElement): void {
		if (!this.monthStats || this.monthStats.incompleteDays.length === 0) return;

		const callout = parent.createDiv({ cls: "hours-count-callout" });
		callout.createEl("strong", {
			text: `Incomplete sessions (${this.monthStats.incompleteDays.length})`,
		});
		const list = callout.createEl("ul", { cls: "hours-count-incomplete-list" });
		for (const day of this.monthStats.incompleteDays) {
			list.createEl("li", { text: day });
		}
	}

	private renderRefreshButton(parent: HTMLElement): void {
		const btn = parent.createEl("button", {
			text: "Refresh",
			cls: "hours-count-refresh-btn",
		});
		btn.addEventListener("click", () => this.refresh());
	}

	private addStatRow(parent: HTMLElement, label: string, value: string): void {
		parent.createSpan({ text: label, cls: "hours-count-label" });
		parent.createSpan({ text: value, cls: "hours-count-value" });
	}
}
