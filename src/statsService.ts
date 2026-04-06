import { App } from "obsidian";
import type { HoursCountSettings, DayStats, WeekStats, MonthStats } from "./types";
import {
	parseClockLine,
	isClockLineOpen,
	isPtoLine,
	parseDateString,
	formatDateToString,
	getWeekStart,
	getWeekEnd,
} from "./timeUtils";
import {
	getMonthlyFiles,
	resolveWeeklyFile,
	findDayHeaderIndex,
	getClockLineInfo,
} from "./fileResolver";

// Matches an H2 date header: "## YYYY.MM.DD - DayName"
const HEADER_RE = /^## (\d{4}\.\d{2}\.\d{2}) - \w+$/;

export class StatsService {
	constructor(
		private app: App,
		private getSettings: () => HoursCountSettings
	) {}

	async getMonthStats(year: number, month: number): Promise<MonthStats> {
		const files = getMonthlyFiles(this.app, this.getSettings(), year, month);
		let allDays: DayStats[] = [];

		for (const file of files) {
			const content = await this.app.vault.read(file);
			allDays = allDays.concat(this.extractDayStats(content, year, month));
		}

		const completedDays = allDays.filter((d) => d.hasClockLine && d.isComplete);
		const daysWorked = completedDays.length;
		const totalMinutes = completedDays.reduce((s, d) => s + d.totalMinutes, 0);
		const averageMinutesPerDay =
			daysWorked > 0 ? Math.round(totalMinutes / daysWorked) : 0;
		const incompleteDays = allDays
			.filter((d) => d.hasClockLine && !d.isComplete && !d.isPto)
			.map((d) => d.date);
		const ptoDates = allDays.filter((d) => d.isPto).map((d) => d.date);
		const ptoDays = ptoDates.length;
		const ptoMinutes = allDays.reduce((s, d) => s + d.ptoMinutes, 0);

		return { totalMinutes, daysWorked, averageMinutesPerDay, incompleteDays, ptoDays, ptoDates, ptoMinutes };
	}

	async getThisWeekStats(): Promise<WeekStats> {
		const today = new Date();
		const settings = this.getSettings();
		const weekStart = getWeekStart(today, settings.weekStartDay);
		const weekEnd = getWeekEnd(weekStart);

		// Enumerate every day in the week
		const dates: Date[] = [];
		const cursor = new Date(weekStart);
		while (cursor <= weekEnd) {
			dates.push(new Date(cursor));
			cursor.setDate(cursor.getDate() + 1);
		}

		const ptoMinutesPerDay = Math.round(this.getSettings().ptoHoursPerDay * 60);
		let totalMinutes = 0;
		let daysWorked = 0;
		let ptoDays = 0;
		let ptoMinutes = 0;

		// Cache file content to avoid re-reading the same file multiple times
		const contentCache = new Map<string, string>();

		for (const date of dates) {
			const file = resolveWeeklyFile(this.app, settings, date);
			if (!file) continue;

			let content = contentCache.get(file.path);
			if (content === undefined) {
				content = await this.app.vault.read(file);
				contentCache.set(file.path, content);
			}

			const headerIdx = findDayHeaderIndex(content, date);
			if (headerIdx === -1) continue;

			const clockInfo = getClockLineInfo(content, headerIdx);
			if (!clockInfo) continue;

			if (isPtoLine(clockInfo.lineContent)) {
				ptoDays++;
				ptoMinutes += ptoMinutesPerDay;
				continue;
			}

			const parsed = parseClockLine(clockInfo.lineContent);
			if (!parsed || isClockLineOpen(parsed)) continue;

			totalMinutes += parsed.totalMinutes;
			ptoMinutes += parsed.ptoMinutes;
			daysWorked++;
		}

		return { totalMinutes, daysWorked, ptoDays, ptoMinutes };
	}

	/**
	 * Extract DayStats for every date header in `content` that belongs to
	 * the specified year/month. Month-boundary files may contain headers from
	 * adjacent months; those are filtered out here.
	 */
	private extractDayStats(
		content: string,
		year: number,
		month: number
	): DayStats[] {
		const ptoMinutesPerDay = Math.round(this.getSettings().ptoHoursPerDay * 60);
		const lines = content.split("\n");
		const results: DayStats[] = [];

		for (let i = 0; i < lines.length; i++) {
			const match = HEADER_RE.exec(lines[i].trimEnd());
			if (!match) continue;

			const dateStr = match[1];
			const date = parseDateString(dateStr);
			if (!date) continue;
			if (date.getFullYear() !== year || date.getMonth() + 1 !== month) continue;

			const clockIdx = i + 1;
			if (clockIdx >= lines.length) {
				results.push({ date: dateStr, totalMinutes: 0, ptoMinutes: 0, isComplete: true, hasClockLine: false, isPto: false });
				continue;
			}

			if (isPtoLine(lines[clockIdx])) {
				results.push({ date: dateStr, totalMinutes: 0, ptoMinutes: ptoMinutesPerDay, isComplete: true, hasClockLine: false, isPto: true });
				continue;
			}

			const parsed = parseClockLine(lines[clockIdx]);
			if (!parsed) {
				results.push({ date: dateStr, totalMinutes: 0, ptoMinutes: 0, isComplete: true, hasClockLine: false, isPto: false });
				continue;
			}

			results.push({
				date: dateStr,
				totalMinutes: parsed.totalMinutes,
				ptoMinutes: parsed.ptoMinutes,
				isComplete: !isClockLineOpen(parsed),
				hasClockLine: true,
				isPto: false,
			});
		}

		return results;
	}
}
