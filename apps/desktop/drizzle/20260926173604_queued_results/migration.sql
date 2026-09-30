CREATE TABLE `queued_results` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`text` text NOT NULL,
	`queued_at` text NOT NULL,
	CONSTRAINT `fk_queued_results_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `queued_by_session` ON `queued_results` (`session_id`,`queued_at`);