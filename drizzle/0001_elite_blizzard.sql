CREATE TABLE `auth_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`resets_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_limit_expiry_idx` ON `auth_limits` (`resets_at`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'invite' NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`workspace_name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`revoked_at` text,
	`delivery_status` text DEFAULT 'not_sent' NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invitation_kind_check" CHECK("invitations"."kind" in ('invite','reset'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitations` (`email`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_expiry_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`last_login_at` text,
	CONSTRAINT "user_role_check" CHECK("users"."role" in ('admin','organizer')),
	CONSTRAINT "user_status_check" CHECK("users"."status" in ('active','disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);