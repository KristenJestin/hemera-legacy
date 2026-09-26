PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_context_deliveries` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`fingerprint` text NOT NULL,
	`delivered_at` text NOT NULL,
	CONSTRAINT `fk_context_deliveries_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT "delivery_kind_is_known" CHECK("kind" IN ('base', 'native', 'provided', 'instructions', 'brief', 'answer', 'edit', 'internal', 'notice', 'request'))
);
--> statement-breakpoint
INSERT INTO `__new_context_deliveries`(`id`, `session_id`, `kind`, `path`, `fingerprint`, `delivered_at`) SELECT `id`, `session_id`, `kind`, `path`, `fingerprint`, `delivered_at` FROM `context_deliveries`;--> statement-breakpoint
DROP TABLE `context_deliveries`;--> statement-breakpoint
ALTER TABLE `__new_context_deliveries` RENAME TO `context_deliveries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_once_per_change` ON `context_deliveries` (`session_id`,`kind`,`path`,`fingerprint`) WHERE "context_deliveries"."kind" IN ('base', 'native', 'provided');