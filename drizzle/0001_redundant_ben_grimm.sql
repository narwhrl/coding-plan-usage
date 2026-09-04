ALTER TABLE `accounts` ADD `consecutive_failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `last_error_at` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `alert_level` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `alert_notified_at` text;