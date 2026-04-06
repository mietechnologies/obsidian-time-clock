import { App, TFile, normalizePath } from "obsidian";
import type { HoursCountSettings } from "./types";
import {
	formatDateToString,
	parseDateString,
	buildDayHeader,
	buildMonthFolderPath,
	PTO_LINE,
	isPtoLine,
} from "./timeUtils";
import { findDayHeaderIndex, getClockLineInfo } from "./fileResolver";
import { parseClockLine } from "./timeUtils";

export interface ScheduleResult {
	ok: boolean;
	reason?: string;
	daysMarked: number;
	daysSkipped: number;
	filesCreated: number;
}

// ---- Week helpers (Mon–Fri convention for file naming) ----

/** Get Monday of the week containing `date`. */
function getWeekMonday(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	const dow = d.getDay(); // 0=Sun
	const diff = dow === 0 ? -6 : 1 - dow;
	d.setDate(d.getDate() + diff);
	return d;
}

/** Get Friday 4 days after the given Monday. */
function getWeekFriday(monday: Date): Date {
	const d = new Date(monday);
	d.setDate(d.getDate() + 4);
	return d;
}

/** All Mon–Fri dates between start and end (inclusive). */
function getWorkDaysInRange(start: Date, end: Date): Date[] {
	const days: Date[] = [];
	const cursor = new Date(start);
	cursor.setHours(0, 0, 0, 0);
	const endNorm = new Date(end);
	endNorm.setHours(23, 59, 59, 999);
	while (cursor <= endNorm) {
		const dow = cursor.getDay();
		if (dow >= 1 && dow <= 5) days.push(new Date(cursor));
		cursor.setDate(cursor.getDate() + 1);
	}
	return days;
}

/** Build initial file content: one H2 header per work day, separated by blank lines. */
function buildWeekFileContent(monday: Date): string {
	const sections: string[] = [];
	for (let i = 0; i < 5; i++) {
		const d = new Date(monday);
		d.setDate(d.getDate() + i);
		sections.push(buildDayHeader(d));
	}
	return sections.join("\n\n") + "\n";
}

// Matches an H2 date header line.
const HEADER_RE = /^## (\d{4}\.\d{2}\.\d{2}) - \w+$/;

/**
 * Insert an H2 header for `date` into `content` at the correct date-sorted position.
 * Returns the updated content string.
 */
function insertDayHeader(content: string, date: Date): string {
	const newHeader = buildDayHeader(date);
	const dateStr = formatDateToString(date);
	const lines = content.split("\n");

	// Collect all existing H2 date header positions
	const headers: { idx: number; dateStr: string }[] = [];
	for (let i = 0; i < lines.length; i++) {
		const m = HEADER_RE.exec(lines[i].trimEnd());
		if (m) headers.push({ idx: i, dateStr: m[1] });
	}

	// Find the first header whose date is after ours
	const nextHeader = headers.find((h) => h.dateStr > dateStr);

	if (!nextHeader) {
		// Append at end of file
		const trimmed = content.trimEnd();
		return trimmed + (trimmed ? "\n\n" : "") + newHeader + "\n";
	}

	// Insert before nextHeader, adding a blank line after the new header
	const insertAt = nextHeader.idx;
	const needsBlankBefore =
		insertAt > 0 && lines[insertAt - 1].trim() !== "";

	const toInsert = needsBlankBefore
		? ["", newHeader, ""]
		: [newHeader, ""];

	lines.splice(insertAt, 0, ...toInsert);
	return lines.join("\n");
}

// ---- Scheduler ----

export class PtoScheduler {
	constructor(
		private app: App,
		private getSettings: () => HoursCountSettings
	) {}

	async schedulePto(start: Date, end: Date): Promise<ScheduleResult> {
		const workDays = getWorkDaysInRange(start, end);
		if (workDays.length === 0) {
			return {
				ok: false,
				reason: "No work days (Mon–Fri) in the selected range.",
				daysMarked: 0,
				daysSkipped: 0,
				filesCreated: 0,
			};
		}

		let daysMarked = 0;
		let daysSkipped = 0;
		let filesCreated = 0;

		// Group work days by their Monday
		const weekMap = new Map<string, Date[]>();
		for (const day of workDays) {
			const monday = getWeekMonday(day);
			const key = formatDateToString(monday);
			if (!weekMap.has(key)) weekMap.set(key, []);
			weekMap.get(key)!.push(day);
		}

		for (const [mondayStr, days] of weekMap) {
			const monday = parseDateString(mondayStr)!;
			const friday = getWeekFriday(monday);

			const { file, created } = await this.getOrCreateWeeklyFile(monday, friday);
			if (created) filesCreated++;

			// Work on content in-memory; one write per week file
			let content = await this.app.vault.read(file);

			for (const day of days) {
				// Ensure the day header exists
				let headerIdx = findDayHeaderIndex(content, day);
				if (headerIdx === -1) {
					content = insertDayHeader(content, day);
					headerIdx = findDayHeaderIndex(content, day);
				}

				// Check what follows the header
				const clockInfo = getClockLineInfo(content, headerIdx);
				if (clockInfo) {
					if (isPtoLine(clockInfo.lineContent)) {
						daysSkipped++;
						continue;
					}
					if (parseClockLine(clockInfo.lineContent)) {
						// Day already has clock data — leave it alone
						daysSkipped++;
						continue;
					}
				}

				// Insert PTO marker immediately after the header
				const lines = content.split("\n");
				lines.splice(headerIdx + 1, 0, PTO_LINE);
				content = lines.join("\n");
				daysMarked++;
			}

			await this.app.vault.modify(file, content);
		}

		return { ok: true, daysMarked, daysSkipped, filesCreated };
	}

	private async getOrCreateWeeklyFile(
		monday: Date,
		friday: Date
	): Promise<{ file: TFile; created: boolean }> {
		const settings = this.getSettings();
		const startStr = formatDateToString(monday);
		const endStr = formatDateToString(friday);
		const fileName = `${startStr} - ${endStr}.md`;

		// Files live in the month folder of the Friday (week-end date)
		const year = friday.getFullYear();
		const month = friday.getMonth() + 1;
		const folderPath = normalizePath(
			buildMonthFolderPath(settings.notesFolder, year, month)
		);
		const filePath = normalizePath(`${folderPath}/${fileName}`);

		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) return { file: existing, created: false };

		await this.ensureFolder(folderPath);
		const content = buildWeekFileContent(monday);
		const file = await this.app.vault.create(filePath, content);
		return { file, created: true };
	}

	/** Create each path segment in `folderPath` if it doesn't already exist. */
	private async ensureFolder(folderPath: string): Promise<void> {
		const parts = folderPath.split("/").filter(Boolean);
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!(await this.app.vault.adapter.exists(current))) {
				await this.app.vault.createFolder(current);
			}
		}
	}
}
