ALTER TABLE `build_attempts` ADD `reproduction` text;--> statement-breakpoint
ALTER TABLE `build_attempts` ADD `reproduction_gone` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `build_reproduction` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `build_reproduction_gone` integer;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_build_attempts` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`scope` text NOT NULL,
	`build_task_id` text,
	`story_id` text,
	`number` integer NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`result` text,
	`told_at` text,
	`reproduction` text,
	`reproduction_gone` integer,
	CONSTRAINT `fk_build_attempts_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_build_attempts_build_task_id_build_tasks_id_fk` FOREIGN KEY (`build_task_id`) REFERENCES `build_tasks`(`id`) ON DELETE CASCADE,
	CONSTRAINT "attempt_scope_is_known" CHECK("scope" IN ('task', 'story', 'build')),
	CONSTRAINT "attempt_result_is_known" CHECK("result" IS NULL OR "result" IN ('green', 'red', 'unverified')),
	CONSTRAINT "attempt_names_its_subject" CHECK(("scope" = 'task') = ("build_task_id" IS NOT NULL) AND ("scope" = 'story') = ("story_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_build_attempts`(`id`, `session_id`, `scope`, `build_task_id`, `story_id`, `number`, `started_at`, `ended_at`, `result`, `told_at`) SELECT `id`, `session_id`, `scope`, `build_task_id`, `story_id`, `number`, `started_at`, `ended_at`, `result`, `told_at` FROM `build_attempts`;--> statement-breakpoint
DROP TABLE `build_attempts`;--> statement-breakpoint
ALTER TABLE `__new_build_attempts` RENAME TO `build_attempts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_build_blockers` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`build_task_id` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`raised_at` text NOT NULL,
	`dismissed_at` text,
	CONSTRAINT `fk_build_blockers_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_build_blockers_build_task_id_build_tasks_id_fk` FOREIGN KEY (`build_task_id`) REFERENCES `build_tasks`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_build_blockers`(`id`, `session_id`, `build_task_id`, `reason`, `note`, `raised_at`, `dismissed_at`) SELECT `id`, `session_id`, `build_task_id`, `reason`, `note`, `raised_at`, `dismissed_at` FROM `build_blockers`;--> statement-breakpoint
DROP TABLE `build_blockers`;--> statement-breakpoint
ALTER TABLE `__new_build_blockers` RENAME TO `build_blockers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_build_launches` (
	`id` text PRIMARY KEY,
	`spec_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`workspace_id` text,
	`state` text NOT NULL,
	`session_id` text,
	`detail` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_build_launches_spec_id_specs_id_fk` FOREIGN KEY (`spec_id`) REFERENCES `specs`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_build_launches_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_build_launches_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE SET NULL,
	CONSTRAINT "launch_state_is_known" CHECK("state" IN ('waiting', 'starting', 'started', 'failed', 'cancelled'))
);
--> statement-breakpoint
INSERT INTO `__new_build_launches`(`id`, `spec_id`, `revision_id`, `workspace_id`, `state`, `session_id`, `detail`, `created_at`, `updated_at`) SELECT `id`, `spec_id`, `revision_id`, `workspace_id`, `state`, `session_id`, `detail`, `created_at`, `updated_at` FROM `build_launches`;--> statement-breakpoint
DROP TABLE `build_launches`;--> statement-breakpoint
ALTER TABLE `__new_build_launches` RENAME TO `build_launches`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_build_tasks` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`task_id` text NOT NULL,
	`label` text NOT NULL,
	`rank` text NOT NULL,
	`state` text NOT NULL,
	`handed_at` text,
	`started_at` text,
	`finished_at` text,
	`ended_at` text,
	`skip_reason` text,
	`skip_unblocks` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_build_tasks_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `build_task_once_in_session` UNIQUE(`session_id`,`task_id`),
	CONSTRAINT `build_task_label_in_session` UNIQUE(`session_id`,`label`),
	CONSTRAINT "build_task_state_is_known" CHECK("state" IN ('waiting', 'ready', 'in_progress', 'checking', 'done', 'yours', 'blocked', 'skipped'))
);
--> statement-breakpoint
INSERT INTO `__new_build_tasks`(`id`, `session_id`, `task_id`, `label`, `rank`, `state`, `handed_at`, `started_at`, `finished_at`, `ended_at`, `skip_reason`, `skip_unblocks`, `updated_at`) SELECT `id`, `session_id`, `task_id`, `label`, `rank`, `state`, `handed_at`, `started_at`, `finished_at`, `ended_at`, `skip_reason`, `skip_unblocks`, `updated_at` FROM `build_tasks`;--> statement-breakpoint
DROP TABLE `build_tasks`;--> statement-breakpoint
ALTER TABLE `__new_build_tasks` RENAME TO `build_tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_command_runs` (
	`id` text PRIMARY KEY,
	`session_id` text,
	`command_id` text,
	`name` text NOT NULL,
	`line` text NOT NULL,
	`type` text NOT NULL,
	`cwd` text NOT NULL,
	`state` text NOT NULL,
	`pid` integer,
	`url` text,
	`exit_code` integer,
	`output` text DEFAULT '' NOT NULL,
	`output_bytes` integer DEFAULT 0 NOT NULL,
	`truncated` integer DEFAULT 0 NOT NULL,
	`started_by` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`workspace_id` text,
	`environment` text DEFAULT '{}' NOT NULL,
	`ready_at` text,
	`port_conflict` text,
	`folder` text,
	`scope` text DEFAULT 'workspace' NOT NULL,
	`told` text DEFAULT 'ended' NOT NULL,
	CONSTRAINT `fk_command_runs_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_command_runs_command_id_project_commands_id_fk` FOREIGN KEY (`command_id`) REFERENCES `project_commands`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_command_runs_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE SET NULL,
	CONSTRAINT "run_state_is_known" CHECK("state" IN ('running', 'exited', 'failed', 'stopped')),
	CONSTRAINT "run_scope_is_known" CHECK("scope" IN ('workspace', 'project')),
	CONSTRAINT "run_starter_is_known" CHECK("started_by" IN ('agent', 'user'))
);
--> statement-breakpoint
INSERT INTO `__new_command_runs`(`id`, `session_id`, `command_id`, `name`, `line`, `type`, `cwd`, `state`, `pid`, `url`, `exit_code`, `output`, `output_bytes`, `truncated`, `started_by`, `started_at`, `ended_at`, `workspace_id`, `environment`, `ready_at`, `port_conflict`, `folder`, `scope`, `told`) SELECT `id`, `session_id`, `command_id`, `name`, `line`, `type`, `cwd`, `state`, `pid`, `url`, `exit_code`, `output`, `output_bytes`, `truncated`, `started_by`, `started_at`, `ended_at`, `workspace_id`, `environment`, `ready_at`, `port_conflict`, `folder`, `scope`, `told` FROM `command_runs`;--> statement-breakpoint
DROP TABLE `command_runs`;--> statement-breakpoint
ALTER TABLE `__new_command_runs` RENAME TO `command_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_specs` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`slug` text NOT NULL,
	`status` text NOT NULL,
	`priority` text,
	`workspace_id` text,
	`current_revision_id` text NOT NULL,
	`writer_session_id` text,
	`content_version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_specs_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_specs_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_specs_writer_session_id_sessions_id_fk` FOREIGN KEY (`writer_session_id`) REFERENCES `sessions`(`id`),
	CONSTRAINT `spec_key_in_project` UNIQUE(`project_id`,`key`),
	CONSTRAINT "spec_status_is_known" CHECK("status" IN ('draft', 'ready', 'in_progress', 'cancelled'))
);
--> statement-breakpoint
INSERT INTO `__new_specs`(`id`, `project_id`, `key`, `slug`, `status`, `priority`, `workspace_id`, `current_revision_id`, `writer_session_id`, `content_version`, `created_at`, `updated_at`) SELECT `id`, `project_id`, `key`, `slug`, `status`, `priority`, `workspace_id`, `current_revision_id`, `writer_session_id`, `content_version`, `created_at`, `updated_at` FROM `specs`;--> statement-breakpoint
DROP TABLE `specs`;--> statement-breakpoint
ALTER TABLE `__new_specs` RENAME TO `specs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `attempt_by_session` ON `build_attempts` (`session_id`,`scope`);--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_number_of_task` ON `build_attempts` (`build_task_id`,`number`) WHERE "build_attempts"."build_task_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_number_of_story` ON `build_attempts` (`session_id`,`story_id`,`number`) WHERE "build_attempts"."story_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_number_of_build` ON `build_attempts` (`session_id`,`number`) WHERE "build_attempts"."scope" = 'build';--> statement-breakpoint
CREATE INDEX `blocker_by_session` ON `build_blockers` (`session_id`,`raised_at`);--> statement-breakpoint
CREATE INDEX `launch_by_spec` ON `build_launches` (`spec_id`,`state`);--> statement-breakpoint
CREATE INDEX `build_task_by_state` ON `build_tasks` (`session_id`,`state`);--> statement-breakpoint
CREATE INDEX `run_by_session` ON `command_runs` (`session_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `run_by_workspace` ON `command_runs` (`workspace_id`,`state`);--> statement-breakpoint
CREATE INDEX `spec_by_project` ON `specs` (`project_id`);