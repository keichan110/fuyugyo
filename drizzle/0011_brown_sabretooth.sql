CREATE TABLE `weather_fetch_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`point_id` text NOT NULL,
	`source` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`ok` integer NOT NULL,
	`http_status` integer,
	`rows_upserted` integer,
	`error` text,
	FOREIGN KEY (`point_id`) REFERENCES `weather_points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_weather_fetch_logs_point_time` ON `weather_fetch_logs` (`point_id`,`fetched_at`);--> statement-breakpoint
CREATE TABLE `weather_fetch_state` (
	`point_id` text NOT NULL,
	`source` text NOT NULL,
	`last_modified` text,
	`expires_at` integer,
	`last_fetched_at` integer,
	PRIMARY KEY(`point_id`, `source`),
	FOREIGN KEY (`point_id`) REFERENCES `weather_points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `weather_points` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`elevation_m` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weather_steps` (
	`point_id` text NOT NULL,
	`source` text NOT NULL,
	`time` integer NOT NULL,
	`step_hours` integer NOT NULL,
	`temperature_c` real,
	`precipitation_mm` real,
	`wind_speed_ms` real,
	`wind_direction_deg` integer,
	`cloud_cover_pct` integer,
	`condition` text,
	`raw_symbol` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`point_id`, `source`, `time`),
	FOREIGN KEY (`point_id`) REFERENCES `weather_points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_weather_steps_time` ON `weather_steps` (`time`);