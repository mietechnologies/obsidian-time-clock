import { App, PluginSettingTab, Setting } from "obsidian";
import type HoursCountPlugin from "../main";
import type { HoursCountSettings } from "./types";

export const DEFAULT_SETTINGS: HoursCountSettings = {
	notesFolder: "Daily Notes",
	weekStartDay: 0,
};

export class HoursCountSettingTab extends PluginSettingTab {
	plugin: HoursCountPlugin;

	constructor(app: App, plugin: HoursCountPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Hours Count Settings" });

		new Setting(containerEl)
			.setName("Daily notes folder")
			.setDesc(
				'Root folder for your daily notes (e.g. "Daily Notes"). ' +
				"Expected subfolder structure: {year}/{month}/weekly-file.md"
			)
			.addText((text) =>
				text
					.setPlaceholder("Daily Notes")
					.setValue(this.plugin.settings.notesFolder)
					.onChange(async (value) => {
						this.plugin.settings.notesFolder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Week start day")
			.setDesc("The first day of the week used for weekly stats.")
			.addDropdown((drop) => {
				const days = [
					"Sunday",
					"Monday",
					"Tuesday",
					"Wednesday",
					"Thursday",
					"Friday",
					"Saturday",
				];
				days.forEach((d, i) => drop.addOption(String(i), d));
				drop
					.setValue(String(this.plugin.settings.weekStartDay))
					.onChange(async (value) => {
						this.plugin.settings.weekStartDay = parseInt(value);
						await this.plugin.saveSettings();
					});
			});
	}
}
