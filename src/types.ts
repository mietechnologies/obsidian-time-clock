export interface HoursCountSettings {
	notesFolder: string;
	weekStartDay: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
}

export interface TimeSession {
	start: string;      // "HH:MM"
	end: string | null; // "HH:MM" or null when open (??:??)
}

export interface ParsedClockLine {
	sessions: TimeSession[];
	totalMinutes: number; // sum of completed sessions only
	raw: string;          // original line text
}

export interface DayStats {
	date: string;        // "YYYY.MM.DD"
	totalMinutes: number;
	isComplete: boolean; // true = no open sessions
	hasClockLine: boolean;
	isPto: boolean;      // true = day is marked as PTO
}

export interface WeekStats {
	totalMinutes: number;
	daysWorked: number;
	ptoDays: number;
}

export interface MonthStats {
	totalMinutes: number;
	daysWorked: number;
	averageMinutesPerDay: number;
	incompleteDays: string[]; // "YYYY.MM.DD" list
	ptoDays: number;
	ptoDates: string[];       // "YYYY.MM.DD" list
}

export type ClockResult =
	| { ok: true }
	| { ok: false; reason: string };
