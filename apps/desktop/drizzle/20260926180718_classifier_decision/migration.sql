PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_session_entries` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`kind` text DEFAULT 'message' NOT NULL,
	`body` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`origin` text DEFAULT 'live' NOT NULL,
	`correlation_id` text,
	`turn_id` text,
	`state` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_session_entries_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `entry_once_in_session` UNIQUE(`session_id`,`seq`),
	CONSTRAINT "entry_role_is_known" CHECK("role" IN ('user', 'agent', 'hemera')),
	CONSTRAINT "entry_kind_is_known" CHECK("kind" IN ('message', 'thought', 'tool_call', 'diff', 'terminal', 'plan', 'permission_request', 'permission_decision', 'usage', 'turn', 'note', 'hemera_tool_call', 'classifier_decision', 'command_run', 'context_delivery', 'mission_brief', 'spec_question', 'spec_answer', 'spec_proposal', 'command_proposal')),
	CONSTRAINT "entry_origin_is_known" CHECK("origin" IN ('live', 'replay'))
);
--> statement-breakpoint
INSERT INTO `__new_session_entries`(`id`, `session_id`, `seq`, `role`, `kind`, `body`, `payload`, `origin`, `correlation_id`, `turn_id`, `state`, `created_at`) SELECT `id`, `session_id`, `seq`, `role`, `kind`, `body`, `payload`, `origin`, `correlation_id`, `turn_id`, `state`, `created_at` FROM `session_entries`;--> statement-breakpoint
DROP TABLE `session_entries`;--> statement-breakpoint
ALTER TABLE `__new_session_entries` RENAME TO `session_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `entry_by_correlation` ON `session_entries` (`session_id`,`correlation_id`);--> statement-breakpoint
CREATE INDEX `entry_by_turn` ON `session_entries` (`session_id`,`turn_id`);