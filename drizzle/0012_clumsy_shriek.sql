PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invitation_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`max_uses` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_invitation_tokens`("token", "expires_at", "is_active", "created_by", "max_uses", "used_count", "description", "created_at", "updated_at") SELECT "token", "expires_at", "is_active", "created_by", "max_uses", "used_count", "description", "created_at", "updated_at" FROM `invitation_tokens`;--> statement-breakpoint
DROP TABLE `invitation_tokens`;--> statement-breakpoint
ALTER TABLE `__new_invitation_tokens` RENAME TO `invitation_tokens`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_invitation_tokens_expires_at` ON `invitation_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_invitation_tokens_active` ON `invitation_tokens` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_invitation_tokens_created_by` ON `invitation_tokens` (`created_by`);--> statement-breakpoint
CREATE INDEX `idx_invitation_tokens_active_expires` ON `invitation_tokens` (`is_active`,`expires_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `invited_by` text REFERENCES users(id) ON UPDATE no action ON DELETE set null;