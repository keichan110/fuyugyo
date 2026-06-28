CREATE TABLE `certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`department_id` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`organization` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_certifications_department_id` ON `certifications` (`department_id`);--> statement-breakpoint
CREATE INDEX `idx_certifications_active` ON `certifications` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_certifications_organization` ON `certifications` (`organization`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_code_unique` ON `departments` (`code`);--> statement-breakpoint
CREATE INDEX `idx_departments_active` ON `departments` (`is_active`);--> statement-breakpoint
CREATE TABLE `instructor_certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`instructor_id` text NOT NULL,
	`certification_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`certification_id`) REFERENCES `certifications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_instructor_cert_unique` ON `instructor_certifications` (`instructor_id`,`certification_id`);--> statement-breakpoint
CREATE INDEX `idx_instructor_cert_instructor_id` ON `instructor_certifications` (`instructor_id`);--> statement-breakpoint
CREATE INDEX `idx_instructor_cert_certification_id` ON `instructor_certifications` (`certification_id`);--> statement-breakpoint
CREATE TABLE `instructors` (
	`id` text PRIMARY KEY NOT NULL,
	`last_name` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name_kana` text,
	`first_name_kana` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_instructors_status` ON `instructors` (`status`);--> statement-breakpoint
CREATE INDEX `idx_instructors_name` ON `instructors` (`last_name`,`first_name`);--> statement-breakpoint
CREATE INDEX `idx_instructors_kana` ON `instructors` (`last_name_kana`,`first_name_kana`);--> statement-breakpoint
CREATE INDEX `idx_instructors_status_name` ON `instructors` (`status`,`last_name`,`first_name`);--> statement-breakpoint
CREATE INDEX `idx_instructors_status_kana` ON `instructors` (`status`,`last_name_kana`,`first_name_kana`);--> statement-breakpoint
CREATE TABLE `invitation_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`max_uses` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_invitation_tokens_expires_at` ON `invitation_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_invitation_tokens_active` ON `invitation_tokens` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_invitation_tokens_created_by` ON `invitation_tokens` (`created_by`);--> statement-breakpoint
CREATE INDEX `idx_invitation_tokens_active_expires` ON `invitation_tokens` (`is_active`,`expires_at`);--> statement-breakpoint
CREATE TABLE `shift_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_id` text NOT NULL,
	`instructor_id` text NOT NULL,
	`assigned_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shift_assignment_unique` ON `shift_assignments` (`shift_id`,`instructor_id`);--> statement-breakpoint
CREATE INDEX `idx_shift_assignments_shift_id` ON `shift_assignments` (`shift_id`);--> statement-breakpoint
CREATE INDEX `idx_shift_assignments_instructor_id` ON `shift_assignments` (`instructor_id`);--> statement-breakpoint
CREATE INDEX `idx_shift_assignments_assigned_at` ON `shift_assignments` (`assigned_at`);--> statement-breakpoint
CREATE INDEX `idx_assignments_instructor_date` ON `shift_assignments` (`instructor_id`,`assigned_at`);--> statement-breakpoint
CREATE INDEX `idx_assignments_date_instructor` ON `shift_assignments` (`assigned_at`,`instructor_id`);--> statement-breakpoint
CREATE TABLE `shift_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_shift_types_active` ON `shift_types` (`is_active`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`department_id` text NOT NULL,
	`shift_type_id` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shift_type_id`) REFERENCES `shift_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_shift_per_day` ON `shifts` (`date`,`department_id`,`shift_type_id`);--> statement-breakpoint
CREATE INDEX `idx_shifts_department_id` ON `shifts` (`department_id`);--> statement-breakpoint
CREATE INDEX `idx_shifts_shift_type_id` ON `shifts` (`shift_type_id`);--> statement-breakpoint
CREATE INDEX `idx_shifts_date` ON `shifts` (`date`);--> statement-breakpoint
CREATE INDEX `idx_shifts_date_department` ON `shifts` (`date`,`department_id`);--> statement-breakpoint
CREATE INDEX `idx_shifts_department_type_date` ON `shifts` (`department_id`,`shift_type_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_shifts_date_type` ON `shifts` (`date`,`shift_type_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`line_user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`picture_url` text,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`instructor_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_line_user_id_unique` ON `users` (`line_user_id`);--> statement-breakpoint
CREATE INDEX `idx_users_role` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `idx_users_active` ON `users` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_users_role_active` ON `users` (`role`,`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_instructor_id` ON `users` (`instructor_id`);