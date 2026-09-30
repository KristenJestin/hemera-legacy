PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`title_source` text NOT NULL,
	`provider` text,
	`model` text,
	`native_session_id` text,
	`native_state` text DEFAULT 'none' NOT NULL,
	`cwd` text,
	`choices` text DEFAULT '{}' NOT NULL,
	`workspace_id` text,
	`revision_id` text,
	`mission` text DEFAULT 'free' NOT NULL,
	`spec_id` text,
	`briefed_at` text,
	`created_at` text NOT NULL,
	`last_written_at` text NOT NULL,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`build_phase` text,
	`build_paused_at` text,
	`build_review_at` text,
	`build_detail` text,
	`approach_note` text,
	`build_reproduction` text,
	`build_reproduction_gone` integer,
	CONSTRAINT `fk_sessions_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_sessions_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_sessions_spec_id_specs_id_fk` FOREIGN KEY (`spec_id`) REFERENCES `specs`(`id`),
	CONSTRAINT "session_title_source_is_known" CHECK("title_source" IN ('derived', 'user')),
	CONSTRAINT "session_provider_is_known" CHECK("provider" IS NULL OR "provider" IN ('claude', 'codex', 'opencode')),
	CONSTRAINT "session_native_state_is_known" CHECK("native_state" IN ('none', 'attached', 'lost', 'fallback')),
	CONSTRAINT "session_mission_is_known" CHECK("mission" IN ('free', 'define', 'build')),
	CONSTRAINT "session_build_phase_is_known" CHECK("build_phase" IS NULL OR "build_phase" IN ('prepare', 'execute', 'verify', 'review', 'feedback', 'accepted', 'stopped'))
);
--> statement-breakpoint
INSERT INTO `__new_sessions`(`id`, `project_id`, `title`, `title_source`, `provider`, `model`, `native_session_id`, `native_state`, `cwd`, `choices`, `workspace_id`, `revision_id`, `mission`, `spec_id`, `briefed_at`, `created_at`, `last_written_at`, `archived_at`, `version`, `build_phase`, `build_paused_at`, `build_review_at`, `build_detail`, `approach_note`, `build_reproduction`, `build_reproduction_gone`) SELECT `id`, `project_id`, `title`, `title_source`, `provider`, `model`, `native_session_id`, `native_state`, `cwd`, `choices`, `workspace_id`, `revision_id`, `mission`, `spec_id`, `briefed_at`, `created_at`, `last_written_at`, `archived_at`, `version`, `build_phase`, `build_paused_at`, `build_review_at`, `build_detail`, `approach_note`, `build_reproduction`, `build_reproduction_gone` FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `session_by_project` ON `sessions` (`project_id`,`last_written_at`);