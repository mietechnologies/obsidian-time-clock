export interface HoursCountSettings {
	notesFolder: string;
	weekStartDay: number;    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
	ptoHoursPerDay: number;  // hours credited for a full PTO day (default 8)
}

export interface TimeSession {
	start: string;      // "HH:MM"
	end: string | null; // "HH:MM" or null when open (??:??)
}

export interface ParsedClockLine {
	sessions: TimeSession[];
	totalMinutes: number; // sum of completed work sessions only
	ptoMinutes: number;   // partial-day PTO duration from a "PTO - H:MM" token
	raw: string;          // original line text
}

export interface DayStats {
	date: string;        // "YYYY.MM.DD"
	totalMinutes: number;
	ptoMinutes: number;  // PTO minutes for the day (full or partial)
	isComplete: boolean; // true = no open sessions
	hasClockLine: boolean;
	isPto: boolean;      // true = full-day PTO marker (*{PTO}*)
}

export interface WeekStats {
	totalMinutes: number;
	daysWorked: number;
	ptoDays: number;
	ptoMinutes: number;
}

export interface MonthStats {
	totalMinutes: number;
	daysWorked: number;
	averageMinutesPerDay: number;
	incompleteDays: string[]; // "YYYY.MM.DD" list
	ptoDays: number;
	ptoDates: string[];       // "YYYY.MM.DD" list
	ptoMinutes: number;
}

export type ClockResult =
	| { ok: true }
	| { ok: false; reason: string };
