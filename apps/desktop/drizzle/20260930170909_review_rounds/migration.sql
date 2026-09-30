CREATE TABLE `review_feedback` (
	`id` text PRIMARY KEY,
	`round_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`anchor_story_id` text,
	`anchor_criterion` integer,
	`anchor_repository` text,
	`anchor_path` text,
	`anchor_line_start` integer,
	`anchor_line_end` integer,
	`anchor_side` text,
	`created_at` text NOT NULL,
	`withdrawn_at` text,
	CONSTRAINT `fk_review_feedback_round_id_review_rounds_id_fk` FOREIGN KEY (`round_id`) REFERENCES `review_rounds`(`id`) ON DELETE CASCADE,
	CONSTRAINT "feedback_kind_is_known" CHECK("kind" IN ('product', 'general', 'question')),
	CONSTRAINT "feedback_side_is_known" CHECK("anchor_side" IS NULL OR "anchor_side" IN ('old', 'new')),
	CONSTRAINT "feedback_criterion_of_a_story" CHECK("anchor_criterion" IS NULL OR "anchor_story_id" IS NOT NULL),
	CONSTRAINT "feedback_code_anchor_is_whole" CHECK(("anchor_repository" IS NULL) = ("anchor_path" IS NULL) AND ("anchor_line_start" IS NULL) = ("anchor_line_end" IS NULL) AND ("anchor_line_start" IS NULL OR "anchor_path" IS NOT NULL) AND ("anchor_side" IS NULL OR "anchor_line_start" IS NOT NULL)),
	CONSTRAINT "feedback_one_anchor_at_most" CHECK("anchor_story_id" IS NULL OR "anchor_path" IS NULL)
);
--> statement-breakpoint
CREATE TABLE `review_round_files` (
	`round_id` text NOT NULL,
	`repository` text NOT NULL,
	`path` text NOT NULL,
	`status` text NOT NULL,
	`added` integer,
	`removed` integer,
	`untracked` integer DEFAULT false NOT NULL,
	CONSTRAINT `review_round_files_pk` PRIMARY KEY(`round_id`, `repository`, `path`),
	CONSTRAINT `fk_review_round_files_round_id_review_rounds_id_fk` FOREIGN KEY (`round_id`) REFERENCES `review_rounds`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `review_round_repositories` (
	`round_id` text NOT NULL,
	`repository` text NOT NULL,
	`head` text NOT NULL,
	`tree` text NOT NULL,
	`base` text,
	`base_commit` text NOT NULL,
	`stale_at` text,
	`stale_tree` text,
	CONSTRAINT `review_round_repositories_pk` PRIMARY KEY(`round_id`, `repository`),
	CONSTRAINT `fk_review_round_repositories_round_id_review_rounds_id_fk` FOREIGN KEY (`round_id`) REFERENCES `review_rounds`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `review_rounds` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`number` integer NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`opened_at` text NOT NULL,
	`fixing_at` text,
	`closed_at` text,
	CONSTRAINT `fk_review_rounds_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `round_number_in_session` UNIQUE(`session_id`,`number`),
	CONSTRAINT "round_kind_is_known" CHECK("kind" IN ('spec', 'code')),
	CONSTRAINT "round_state_is_known" CHECK("state" IN ('open', 'fixing', 'closed'))
);
--> statement-breakpoint
CREATE INDEX `feedback_by_round` ON `review_feedback` (`round_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `round_once_unclosed_per_session` ON `review_rounds` (`session_id`) WHERE "review_rounds"."state" <> 'closed';