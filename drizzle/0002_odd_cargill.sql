PRAGMA foreign_keys=OFF;--> statement-breakpoint
ALTER TABLE `certifications` ADD `department_code` text;--> statement-breakpoint
UPDATE `certifications`
SET `department_code` = (
	SELECT `departments`.`code`
	FROM `departments`
	WHERE `departments`.`id` = `certifications`.`department_id`
);--> statement-breakpoint
CREATE TABLE `__new_certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`department_code` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`organization` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_certifications`("id", "department_code", "name", "short_name", "organization", "description", "is_active", "created_at", "updated_at") SELECT "id", "department_code", "name", "short_name", "organization", "description", "is_active", "created_at", "updated_at" FROM `certifications`;--> statement-breakpoint
DROP TABLE `certifications`;--> statement-breakpoint
ALTER TABLE `__new_certifications` RENAME TO `certifications`;--> statement-breakpoint
CREATE INDEX `idx_certifications_department_code` ON `certifications` (`department_code`);--> statement-breakpoint
CREATE INDEX `idx_certifications_active` ON `certifications` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_certifications_organization` ON `certifications` (`organization`);--> statement-breakpoint
ALTER TABLE `shifts` ADD `department_code` text;--> statement-breakpoint
UPDATE `shifts`
SET `department_code` = (
	SELECT `departments`.`code`
	FROM `departments`
	WHERE `departments`.`id` = `shifts`.`department_id`
);--> statement-breakpoint
CREATE TABLE `__new_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`department_code` text NOT NULL,
	`shift_type_id` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`shift_type_id`) REFERENCES `shift_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_shifts`("id", "date", "department_code", "shift_type_id", "description", "created_at", "updated_at") SELECT "id", "date", "department_code", "shift_type_id", "description", "created_at", "updated_at" FROM `shifts`;--> statement-breakpoint
DROP TABLE `shifts`;--> statement-breakpoint
ALTER TABLE `__new_shifts` RENAME TO `shifts`;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_shift_per_day` ON `shifts` (`date`,`department_code`,`shift_type_id`);--> statement-breakpoint
CREATE INDEX `idx_shifts_department_code` ON `shifts` (`department_code`);--> statement-breakpoint
CREATE INDEX `idx_shifts_shift_type_id` ON `shifts` (`shift_type_id`);--> statement-breakpoint
CREATE INDEX `idx_shifts_date` ON `shifts` (`date`);--> statement-breakpoint
CREATE INDEX `idx_shifts_date_department` ON `shifts` (`date`,`department_code`);--> statement-breakpoint
CREATE INDEX `idx_shifts_department_type_date` ON `shifts` (`department_code`,`shift_type_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_shifts_date_type` ON `shifts` (`date`,`shift_type_id`);--> statement-breakpoint
DROP TABLE `departments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
