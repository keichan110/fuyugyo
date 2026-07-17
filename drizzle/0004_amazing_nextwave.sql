CREATE TABLE `instructor_availabilities` (
	`id` text PRIMARY KEY NOT NULL,
	`instructor_id` text NOT NULL,
	`date` integer NOT NULL,
	`type` text NOT NULL,
	`note` text,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_instructor_availabilities_unique` ON `instructor_availabilities` (`instructor_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_instructor_availabilities_date` ON `instructor_availabilities` (`date`);