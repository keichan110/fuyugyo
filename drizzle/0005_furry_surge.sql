CREATE TABLE `department_shift_type_certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`department_shift_type_id` text NOT NULL,
	`certification_id` text NOT NULL,
	`level` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`department_shift_type_id`) REFERENCES `department_shift_types`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`certification_id`) REFERENCES `certifications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_department_shift_type_cert_unique` ON `department_shift_type_certifications` (`department_shift_type_id`,`certification_id`);--> statement-breakpoint
CREATE INDEX `idx_department_shift_type_cert_frame` ON `department_shift_type_certifications` (`department_shift_type_id`);--> statement-breakpoint
CREATE INDEX `idx_department_shift_type_cert_certification` ON `department_shift_type_certifications` (`certification_id`);