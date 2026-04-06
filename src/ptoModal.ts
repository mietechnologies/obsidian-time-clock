import { App, Modal } from "obsidian";
import { PtoScheduler } from "./ptoScheduler";
import { parseDateString } from "./timeUtils";

export class PtoModal extends Modal {
	constructor(
		app: App,
		private scheduler: PtoScheduler,
		private onSuccess: () => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("hours-count-modal");

		contentEl.createEl("h2", { text: "Schedule PTO", cls: "hours-count-modal-title" });

		// Start date
		const startRow = contentEl.createDiv({ cls: "hours-count-modal-row" });
		startRow.createEl("label", { text: "Start date", cls: "hours-count-modal-label" });
		const startInput = startRow.createEl("input", {
			cls: "hours-count-modal-input",
		});
		startInput.type = "text";
		startInput.placeholder = "YYYY.MM.DD";

		// End date
		const endRow = contentEl.createDiv({ cls: "hours-count-modal-row" });
		endRow.createEl("label", { text: "End date", cls: "hours-count-modal-label" });
		const endInput = endRow.createEl("input", {
			cls: "hours-count-modal-input",
		});
		endInput.type = "text";
		endInput.placeholder = "YYYY.MM.DD (leave blank for single day)";

		// Status area
		const status = contentEl.createDiv({ cls: "hours-count-modal-status" });

		// Submit button
		const submitBtn = contentEl.createEl("button", {
			text: "Schedule PTO",
			cls: "hours-count-modal-submit",
		});

		const submit = async () => {
			status.empty();
			status.removeClass("hours-count-modal-status-error", "hours-count-modal-status-ok");

			const startStr = startInput.value.trim();
			const endStr = endInput.value.trim() || startStr;

			const start = parseDateString(startStr);
			if (!start) {
				status.setText("Invalid start date — use YYYY.MM.DD.");
				status.addClass("hours-count-modal-status-error");
				return;
			}

			const end = parseDateString(endStr);
			if (!end) {
				status.setText("Invalid end date — use YYYY.MM.DD.");
				status.addClass("hours-count-modal-status-error");
				return;
			}

			if (end < start) {
				status.setText("End date must be on or after start date.");
				status.addClass("hours-count-modal-status-error");
				return;
			}

			submitBtn.disabled = true;
			submitBtn.setText("Scheduling…");

			const result = await this.scheduler.schedulePto(start, end);

			submitBtn.disabled = false;
			submitBtn.setText("Schedule PTO");

			if (!result.ok) {
				status.setText(result.reason ?? "An error occurred.");
				status.addClass("hours-count-modal-status-error");
				return;
			}

			const parts: string[] = [
				`${result.daysMarked} day${result.daysMarked !== 1 ? "s" : ""} marked as PTO`,
			];
			if (result.filesCreated > 0)
				parts.push(`${result.filesCreated} file${result.filesCreated !== 1 ? "s" : ""} created`);
			if (result.daysSkipped > 0)
				parts.push(`${result.daysSkipped} day${result.daysSkipped !== 1 ? "s" : ""} skipped`);

			status.setText(parts.join(", ") + ".");
			status.addClass("hours-count-modal-status-ok");

			this.onSuccess();
		};

		submitBtn.addEventListener("click", submit);

		const handleEnter = (e: KeyboardEvent) => {
			if (e.key === "Enter") submit();
		};
		startInput.addEventListener("keydown", handleEnter);
		endInput.addEventListener("keydown", handleEnter);

		startInput.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
