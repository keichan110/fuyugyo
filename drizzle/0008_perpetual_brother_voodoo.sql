PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_certification_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`department_shift_type_id` text NOT NULL,
	`certification_id` text NOT NULL,
	`tier_rank` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`department_shift_type_id`) REFERENCES `department_shift_types`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`certification_id`) REFERENCES `certifications`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "certification_requirements_tier_rank_positive" CHECK("__new_certification_requirements"."tier_rank" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_certification_requirements`("id", "department_shift_type_id", "certification_id", "tier_rank", "created_at", "updated_at") SELECT "id", "department_shift_type_id", "certification_id", "tier_rank", "created_at", "updated_at" FROM `certification_requirements`;--> statement-breakpoint
DROP TABLE `certification_requirements`;--> statement-breakpoint
ALTER TABLE `__new_certification_requirements` RENAME TO `certification_requirements`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_certification_requirements_unique` ON `certification_requirements` (`department_shift_type_id`,`certification_id`);--> statement-breakpoint
CREATE INDEX `idx_certification_requirements_frame` ON `certification_requirements` (`department_shift_type_id`);--> statement-breakpoint
CREATE INDEX `idx_certification_requirements_certification` ON `certification_requirements` (`certification_id`);