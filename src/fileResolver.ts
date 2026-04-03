import { App, TFile, TFolder, normalizePath } from "obsidian";
import type { HoursCountSettings } from "./types";
import {
	buildMonthFolderPath,
	buildDayHeader,
	parseDateString,
} from "./timeUtils";

// ---- Weekly file resolution ----

/**
 * Scan the month folder for a weekly file whose date range includes `date`.
 * Also checks the previous month's folder in case of a month-boundary split week.
 */
export function resolveWeeklyFile(
	app: App,
	settings: HoursCountSettings,
	date: Date
): TFile | null {
	const year = date.getFullYear();
	const month = date.getMonth() + 1;

	const file = scanMonthForDate(app, settings, year, month, date);
	if (file) return file;

	// Check previous month (week-spanning files live in the month of their last day)
	const prevMonth = month === 1 ? 12 : month - 1;
	const prevYear = month === 1 ? year - 1 : year;
	return scanMonthForDate(app, settings, prevYear, prevMonth, date);
}

function scanMonthForDate(
	app: App,
	settings: HoursCountSettings,
	year: number,
	month: number,
	date: Date
): TFile | null {
	const files = getMonthlyFiles(app, settings, year, month);
	for (const file of files) {
		const match = file.name.match(
			/^(\d{4}\.\d{2}\.\d{2}) - (\d{4}\.\d{2}\.\d{2})\.md$/
		);
		if (!match) continue;
		const start = parseDateString(match[1]);
		const end = parseDateString(match[2]);
		if (!start || !end) continue;
		end.setHours(23, 59, 59, 999);
		if (date >= start && date <= end) return file;
	}
	return null;
}

// ---- Header and clock line lookup ----

/**
 * Find the line index of the H2 header for `date` in file content.
 * Returns -1 if not found.
 */
export function findDayHeaderIndex(content: string, date: Date): number {
	const expected = buildDayHeader(date);
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trimEnd() === expected) return i;
	}
	return -1;
}

/**
 * Return the clock line index and content for a given header index.
 * The clock line is always at headerIndex + 1.
 */
export function getClockLineInfo(
	content: string,
	headerIndex: number
): { lineIndex: number; lineContent: string } | null {
	const lines = content.split("\n");
	const clockIndex = headerIndex + 1;
	if (clockIndex >= lines.length) return null;
	return { lineIndex: clockIndex, lineContent: lines[clockIndex] };
}

// ---- Folder scanning ----

/** All markdown files directly inside the month folder for a given year/month. */
export function getMonthlyFiles(
	app: App,
	settings: HoursCountSettings,
	year: number,
	month: number
): TFile[] {
	const folderPath = normalizePath(buildMonthFolderPath(settings.notesFolder, year, month));
	return app.vault.getMarkdownFiles().filter((f) => {
		const parentPath = normalizePath(f.parent?.path ?? "");
		return parentPath === folderPath;
	});
}

/** Sorted descending list of year numbers found as subfolders of the notes root. */
export function getAvailableYears(app: App, settings: HoursCountSettings): number[] {
	const root = app.vault.getAbstractFileByPath(
		normalizePath(settings.notesFolder)
	);
	if (!(root instanceof TFolder)) return [];

	const years: number[] = [];
	for (const child of root.children) {
		if (!(child instanceof TFolder)) continue;
		const n = parseInt(child.name);
		if (!isNaN(n) && n > 2000 && n < 2100) years.push(n);
	}
	return years.sort((a, b) => b - a);
}
