CREATE TABLE `department_shift_types` (
	`id` text PRIMARY KEY NOT NULL,
	`department_code` text NOT NULL,
	`shift_type_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`shift_type_id`) REFERENCES `shift_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_department_shift_types_unique` ON `department_shift_types` (`department_code`,`shift_type_id`);--> statement-breakpoint
CREATE INDEX `idx_department_shift_types_department_code` ON `department_shift_types` (`department_code`);--> statement-breakpoint
INSERT INTO `department_shift_types` (
	`id`,
	`department_code`,
	`shift_type_id`,
	`sort_order`
)
SELECT
	lower(hex(randomblob(16))),
	`departments`.`department_code`,
	`shift_types`.`id`,
	row_number() OVER (
		PARTITION BY `departments`.`department_code`
		ORDER BY `shift_types`.`name`, `shift_types`.`id`
	)
FROM (
	SELECT 'ski' AS `department_code`
	UNION ALL
	SELECT 'snowboard' AS `department_code`
) AS `departments`
CROSS JOIN `shift_types`;
