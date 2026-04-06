import { App, Notice } from "obsidian";
import type { HoursCountSettings, ClockResult, TimeSession } from "./types";
import {
	parseClockLine,
	isClockLineOpen,
	isClockLineComplete,
	buildClockLine,
	currentTimeString,
	formatMinutesToHMM,
	formatMinutesToDecimal,
	calculateTotalMinutes,
	isPtoLine,
	PTO_LINE,
} from "./timeUtils";
import {
	resolveWeeklyFile,
	findDayHeaderIndex,
	getClockLineInfo,
} from "./fileResolver";

export class ClockService {
	constructor(
		private app: App,
		private getSettings: () => HoursCountSettings
	) {}

	async clockIn(): Promise<ClockResult> {
		const now = new Date();
		const file = resolveWeeklyFile(this.app, this.getSettings(), now);
		if (!file) {
			return { ok: false, reason: "No weekly file found for today." };
		}

		const content = await this.app.vault.read(file);
		const headerIdx = findDayHeaderIndex(content, now);
		if (headerIdx === -1) {
			return {
				ok: false,
				reason: `No header found for today in ${file.name}.`,
			};
		}

		const lines = content.split("\n");
		const clockInfo = getClockLineInfo(content, headerIdx);
		const timeNow = currentTimeString();

		if (clockInfo !== null) {
			if (isPtoLine(clockInfo.lineContent)) {
				return { ok: false, reason: "Today is marked as PTO." };
			}

			const parsed = parseClockLine(clockInfo.lineContent);

			if (parsed !== null) {
				if (isClockLineOpen(parsed)) {
					return { ok: false, reason: "Already clocked in." };
				}
				if (isClockLineComplete(parsed)) {
					// Append a new open session to the existing entry
					const newSessions: TimeSession[] = [
						...parsed.sessions,
						{ start: timeNow, end: null },
					];
					lines[clockInfo.lineIndex] = buildClockLine(newSessions);
					await this.app.vault.modify(file, lines.join("\n"));
					new Notice(`Hours Count: Clocked in at ${timeNow}.`);
					return { ok: true };
				}
			}
		}

		// No recognized clock line — insert a new one after the header
		const newLine = buildClockLine([{ start: timeNow, end: null }]);
		lines.splice(headerIdx + 1, 0, newLine);
		await this.app.vault.modify(file, lines.join("\n"));
		new Notice(`Hours Count: Clocked in at ${timeNow}.`);
		return { ok: true };
	}

	async clockOut(): Promise<ClockResult> {
		const now = new Date();
		const file = resolveWeeklyFile(this.app, this.getSettings(), now);
		if (!file) {
			return { ok: false, reason: "No weekly file found for today." };
		}

		const content = await this.app.vault.read(file);
		const headerIdx = findDayHeaderIndex(content, now);
		if (headerIdx === -1) {
			return {
				ok: false,
				reason: `No header found for today in ${file.name}.`,
			};
		}

		const clockInfo = getClockLineInfo(content, headerIdx);
		if (!clockInfo) {
			return { ok: false, reason: "Not currently clocked in." };
		}

		const parsed = parseClockLine(clockInfo.lineContent);
		if (!parsed || !isClockLineOpen(parsed)) {
			return { ok: false, reason: "Not currently clocked in." };
		}

		const timeNow = currentTimeString();
		const newSessions: TimeSession[] = parsed.sessions.map((s) =>
			s.end === null ? { start: s.start, end: timeNow } : s
		);

		const lines = content.split("\n");
		lines[clockInfo.lineIndex] = buildClockLine(newSessions);
		await this.app.vault.modify(file, lines.join("\n"));

		const total = calculateTotalMinutes(newSessions);
		new Notice(
			`Hours Count: Clocked out at ${timeNow}. ` +
			`Total today: ${formatMinutesToHMM(total)} (${formatMinutesToDecimal(total)} hrs).`
		);
		return { ok: true };
	}

	/** Check whether today has an active open clock session, is PTO, or is clocked out. */
	async getTodayClockState(): Promise<"in" | "out" | "pto" | "unknown"> {
		const now = new Date();
		const file = resolveWeeklyFile(this.app, this.getSettings(), now);
		if (!file) return "unknown";

		const content = await this.app.vault.read(file);
		const headerIdx = findDayHeaderIndex(content, now);
		if (headerIdx === -1) return "unknown";

		const clockInfo = getClockLineInfo(content, headerIdx);
		if (!clockInfo) return "out";

		if (isPtoLine(clockInfo.lineContent)) return "pto";

		const parsed = parseClockLine(clockInfo.lineContent);
		if (!parsed) return "out";

		return isClockLineOpen(parsed) ? "in" : "out";
	}

	/** Mark today as PTO by inserting a PTO marker after the day header. */
	async markTodayAsPto(): Promise<ClockResult> {
		const now = new Date();
		const file = resolveWeeklyFile(this.app, this.getSettings(), now);
		if (!file) return { ok: false, reason: "No weekly file found for today." };

		const content = await this.app.vault.read(file);
		const headerIdx = findDayHeaderIndex(content, now);
		if (headerIdx === -1) {
			return { ok: false, reason: `No header found for today in ${file.name}.` };
		}

		const lines = content.split("\n");
		const clockInfo = getClockLineInfo(content, headerIdx);

		if (clockInfo !== null) {
			if (isPtoLine(clockInfo.lineContent)) {
				return { ok: false, reason: "Today is already marked as PTO." };
			}
			const parsed = parseClockLine(clockInfo.lineContent);
			if (parsed) {
				if (isClockLineOpen(parsed)) {
					return { ok: false, reason: "Cannot mark PTO while clocked in." };
				}
				return { ok: false, reason: "Today already has clock data." };
			}
		}

		lines.splice(headerIdx + 1, 0, PTO_LINE);
		await this.app.vault.modify(file, lines.join("\n"));
		new Notice("Hours Count: Today marked as PTO.");
		return { ok: true };
	}

	/** Remove the PTO marker from today's entry. */
	async unmarkTodayAsPto(): Promise<ClockResult> {
		const now = new Date();
		const file = resolveWeeklyFile(this.app, this.getSettings(), now);
		if (!file) return { ok: false, reason: "No weekly file found for today." };

		const content = await this.app.vault.read(file);
		const headerIdx = findDayHeaderIndex(content, now);
		if (headerIdx === -1) {
			return { ok: false, reason: `No header found for today in ${file.name}.` };
		}

		const clockInfo = getClockLineInfo(content, headerIdx);
		if (!clockInfo || !isPtoLine(clockInfo.lineContent)) {
			return { ok: false, reason: "Today is not marked as PTO." };
		}

		const lines = content.split("\n");
		lines.splice(clockInfo.lineIndex, 1);
		await this.app.vault.modify(file, lines.join("\n"));
		new Notice("Hours Count: PTO removed for today.");
		return { ok: true };
	}
}
