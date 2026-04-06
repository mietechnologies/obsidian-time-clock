import type { TimeSession, ParsedClockLine } from "./types";

// ---- Constants ----

export const MONTH_NAMES = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

export const WEEKDAY_NAMES = [
	"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

// ---- Regex ----

// Matches a full clock line (with or without surrounding *).
// Accepts both curly-brace and parenthesis session blocks:
//   *{08:04 - 12:50, 15:15 - ??:??} (4:46, 4.77)*
//   *(08:04 - 12:50, 15:15 - ??:??) (?:??, ?.??)*
// Total fields may be numeric or placeholder (?, ?:??, ?.??).
const CLOCK_LINE_RE = /^\*?[\(\{]([^\)\}]*)[\)\}]\s*\(\s*[\d?]+:[\d?]{2}\s*,\s*[\d?]+\.[\d?]{1,2}\s*\*?\)\*?$/;

// Matches a PTO marker line (with or without surrounding *): *{PTO}*
const PTO_LINE_RE = /^\*?\{PTO\}\*?$/;

/** The canonical PTO marker written into notes. */
export const PTO_LINE = "*{PTO}*";

/** True if `line` is a PTO marker. */
export function isPtoLine(line: string): boolean {
	return PTO_LINE_RE.test(line.trim());
}

// Matches one complete session token "HH:MM - HH:MM"
const SESSION_COMPLETE_RE = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/;

// Matches one open session token "HH:MM - ??:??"
const SESSION_OPEN_RE = /^(\d{2}:\d{2})\s*-\s*\?\?:\?\?$/;

// Matches a partial-day PTO token "PTO - H:MM"
const PTO_SESSION_RE = /^PTO\s*-\s*(\d+):(\d{2})$/;

// ---- Time arithmetic ----

/** Parse "HH:MM" into minutes since midnight. */
export function parseTimeToMinutes(time: string): number {
	const [h, m] = time.split(":").map(Number);
	return h * 60 + m;
}

/** Format total minutes as "H:MM" (hours not zero-padded). */
export function formatMinutesToHMM(totalMinutes: number): string {
	const h = Math.floor(totalMinutes / 60);
	const m = totalMinutes % 60;
	return `${h}:${String(m).padStart(2, "0")}`;
}

/** Format total minutes as decimal hours rounded to 2 places. */
export function formatMinutesToDecimal(totalMinutes: number): string {
	return (totalMinutes / 60).toFixed(2);
}

/** Sum of completed (non-open) sessions in minutes. */
export function calculateTotalMinutes(sessions: TimeSession[]): number {
	let total = 0;
	for (const s of sessions) {
		if (s.end === null) continue;
		const diff = parseTimeToMinutes(s.end) - parseTimeToMinutes(s.start);
		if (diff > 0) total += diff;
	}
	return total;
}

// ---- Clock line parsing ----

/**
 * Parse a clock line string into its structured form.
 * Returns null if the line doesn't match the expected format.
 * Handles both italic (*...*) and plain variants.
 */
export function parseClockLine(line: string): ParsedClockLine | null {
	const trimmed = line.trim();
	const match = CLOCK_LINE_RE.exec(trimmed);
	if (!match) return null;

	const sessionsBlock = match[1].trim();
	const sessions: TimeSession[] = [];
	let ptoMinutes = 0;

	for (const part of sessionsBlock.split(",").map((s) => s.trim())) {
		const complete = SESSION_COMPLETE_RE.exec(part);
		if (complete) {
			sessions.push({ start: complete[1], end: complete[2] });
			continue;
		}
		const open = SESSION_OPEN_RE.exec(part);
		if (open) {
			sessions.push({ start: open[1], end: null });
			continue;
		}
		const pto = PTO_SESSION_RE.exec(part);
		if (pto) {
			ptoMinutes += parseInt(pto[1]) * 60 + parseInt(pto[2]);
			continue;
		}
		return null; // unrecognized session format
	}

	return {
		sessions,
		ptoMinutes,
		totalMinutes: calculateTotalMinutes(sessions),
		raw: trimmed,
	};
}

// ---- Clock line building ----

/**
 * Rebuild a clock line string from sessions, with an optional partial-day PTO duration.
 * Always produces the italic form: *{...} (H:MM, D.DD)*
 * The totals in parentheses reflect work time only; PTO is appended as a separate token.
 */
export function buildClockLine(sessions: TimeSession[], ptoMinutes = 0): string {
	const parts = sessions.map((s) => `${s.start} - ${s.end ?? "??:??"}`);
	if (ptoMinutes > 0) parts.push(`PTO - ${formatMinutesToHMM(ptoMinutes)}`);
	const total = calculateTotalMinutes(sessions);
	return `*{${parts.join(", ")}} (${formatMinutesToHMM(total)}, ${formatMinutesToDecimal(total)})*`;
}

// ---- Clock state queries ----

/** True if any session in the line is open (end === null). */
export function isClockLineOpen(parsed: ParsedClockLine): boolean {
	return parsed.sessions.some((s) => s.end === null);
}

/** True if there is at least one session and ALL sessions are complete. */
export function isClockLineComplete(parsed: ParsedClockLine): boolean {
	return parsed.sessions.length > 0 && parsed.sessions.every((s) => s.end !== null);
}

// ---- Date / time helpers ----

/** Current wall-clock time as "HH:MM". */
export function currentTimeString(): string {
	const now = new Date();
	return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** Format a Date as "YYYY.MM.DD". */
export function formatDateToString(d: Date): string {
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const da = String(d.getDate()).padStart(2, "0");
	return `${y}.${mo}.${da}`;
}

/** Parse "YYYY.MM.DD" into a Date at midnight local time. Returns null on failure. */
export function parseDateString(s: string): Date | null {
	const parts = s.split(".");
	if (parts.length !== 3) return null;
	const [y, mo, da] = parts.map(Number);
	if (isNaN(y) || isNaN(mo) || isNaN(da)) return null;
	return new Date(y, mo - 1, da);
}

/** Build the H2 header string for a date: "## YYYY.MM.DD - Weekday" */
export function buildDayHeader(date: Date): string {
	return `## ${formatDateToString(date)} - ${WEEKDAY_NAMES[date.getDay()]}`;
}

/** Month folder name, e.g. "04 - April" */
export function buildMonthFolderName(month: number): string {
	return `${String(month).padStart(2, "0")} - ${MONTH_NAMES[month - 1]}`;
}

/** Full vault-relative path to the folder for a given year/month. */
export function buildMonthFolderPath(root: string, year: number, month: number): string {
	return `${root}/${year}/${buildMonthFolderName(month)}`;
}

/**
 * Get the start of the week containing `date` given a configurable start day.
 * Returns a new Date at midnight.
 */
export function getWeekStart(date: Date, weekStartDay: number): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	const diff = (d.getDay() - weekStartDay + 7) % 7;
	d.setDate(d.getDate() - diff);
	return d;
}

/** Get the end of the week (6 days after start) at end-of-day. */
export function getWeekEnd(weekStart: Date): Date {
	const d = new Date(weekStart);
	d.setDate(d.getDate() + 6);
	d.setHours(23, 59, 59, 999);
	return d;
}
