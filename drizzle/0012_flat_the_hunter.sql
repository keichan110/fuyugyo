CREATE TABLE `access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`line_user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`picture_url` text,
	`country` text,
	`region` text,
	`city` text,
	`requested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_requests_line_user_id_unique` ON `access_requests` (`line_user_id`);--> statement-breakpoint
CREATE INDEX `idx_access_requests_requested_at` ON `access_requests` (`requested_at`);