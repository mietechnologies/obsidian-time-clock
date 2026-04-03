import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

interface HoursCountSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: HoursCountSettings = {
	mySetting: "default",
};

export default class HoursCountPlugin extends Plugin {
	settings: HoursCountSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new HoursCountSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class HoursCountSettingTab extends PluginSettingTab {
	plugin: HoursCountPlugin;

	constructor(app: App, plugin: HoursCountPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
