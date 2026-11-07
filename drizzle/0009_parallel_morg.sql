CREATE TABLE `shift_staffing_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`department_code` text NOT NULL,
	`shift_type_id` text NOT NULL,
	`required_count` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`shift_type_id`) REFERENCES `shift_types`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shift_staffing_requirements_required_count_non_negative" CHECK("shift_staffing_requirements"."required_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_shift_staffing_requirement_per_day` ON `shift_staffing_requirements` (`date`,`department_code`,`shift_type_id`);--> statement-breakpoint
CREATE INDEX `idx_shift_staffing_requirements_date` ON `shift_staffing_requirements` (`date`);