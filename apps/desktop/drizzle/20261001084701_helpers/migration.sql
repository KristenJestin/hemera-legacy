CREATE TABLE `build_claims` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`task` text NOT NULL,
	`path` text NOT NULL,
	`claimed_at` text NOT NULL,
	CONSTRAINT `fk_build_claims_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `build_claim_once` UNIQUE(`session_id`,`path`)
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `helpers_at_once` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `parent_session_id` text REFERENCES sessions(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `sessions` ADD `helper` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `helper_depth` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `helper_task` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `helper_state` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `helper_result` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `helper_ended_at` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`tone` text NOT NULL,
	`spec_prefix` text DEFAULT 'SPEC' NOT NULL,
	`next_spec_number` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`workspaces_root` text,
	`branch_prefix` text,
	`helpers_at_once` integer DEFAULT 3 NOT NULL,
	CONSTRAINT "project_tone_is_known" CHECK("tone" IN ('primary', 'info', 'success', 'warning', 'neutral')),
	CONSTRAINT "project_helpers_at_once_in_range" CHECK("helpers_at_once" BETWEEN 1 AND 6)
);
--> statement-breakpoint
INSERT INTO `__new_projects`(`id`, `name`, `tone`, `spec_prefix`, `next_spec_number`, `created_at`, `updated_at`, `archived_at`, `version`, `workspaces_root`, `branch_prefix`) SELECT `id`, `name`, `tone`, `spec_prefix`, `next_spec_number`, `created_at`, `updated_at`, `archived_at`, `version`, `workspaces_root`, `branch_prefix` FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
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
	`parent_session_id` text,
	`helper` text,
	`helper_depth` integer,
	`helper_task` text,
	`helper_state` text,
	`helper_result` text,
	`helper_ended_at` text,
	CONSTRAINT `fk_sessions_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_sessions_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_sessions_spec_id_specs_id_fk` FOREIGN KEY (`spec_id`) REFERENCES `specs`(`id`),
	CONSTRAINT `fk_sessions_parent_session_id_sessions_id_fk` FOREIGN KEY (`parent_session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT "session_title_source_is_known" CHECK("title_source" IN ('derived', 'user')),
	CONSTRAINT "session_provider_is_known" CHECK("provider" IS NULL OR "provider" IN ('claude', 'codex', 'opencode')),
	CONSTRAINT "session_native_state_is_known" CHECK("native_state" IN ('none', 'attached', 'lost', 'fallback')),
	CONSTRAINT "session_mission_is_known" CHECK("mission" IN ('free', 'define', 'build')),
	CONSTRAINT "session_build_phase_is_known" CHECK("build_phase" IS NULL OR "build_phase" IN ('prepare', 'execute', 'verify', 'accepted', 'stopped')),
	CONSTRAINT "session_helper_state_is_known" CHECK("helper_state" IS NULL OR "helper_state" IN ('running', 'done', 'stopped', 'failed')),
	CONSTRAINT "session_helper_has_a_parent" CHECK(("parent_session_id" IS NULL) = ("helper_state" IS NULL) AND ("parent_session_id" IS NULL) = ("helper_depth" IS NULL)),
	CONSTRAINT "session_helper_depth_in_range" CHECK("helper_depth" IS NULL OR "helper_depth" BETWEEN 1 AND 2)
);
--> statement-breakpoint
INSERT INTO `__new_sessions`(`id`, `project_id`, `title`, `title_source`, `provider`, `model`, `native_session_id`, `native_state`, `cwd`, `choices`, `workspace_id`, `revision_id`, `mission`, `spec_id`, `briefed_at`, `created_at`, `last_written_at`, `archived_at`, `version`, `build_phase`, `build_paused_at`, `build_review_at`, `build_detail`, `approach_note`, `build_reproduction`, `build_reproduction_gone`) SELECT `id`, `project_id`, `title`, `title_source`, `provider`, `model`, `native_session_id`, `native_state`, `cwd`, `choices`, `workspace_id`, `revision_id`, `mission`, `spec_id`, `briefed_at`, `created_at`, `last_written_at`, `archived_at`, `version`, `build_phase`, `build_paused_at`, `build_review_at`, `build_detail`, `approach_note`, `build_reproduction`, `build_reproduction_gone` FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `session_by_project` ON `sessions` (`project_id`,`last_written_at`);--> statement-breakpoint
CREATE INDEX `session_by_parent` ON `sessions` (`parent_session_id`,`helper_state`);