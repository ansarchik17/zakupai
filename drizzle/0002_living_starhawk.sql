CREATE TABLE `email_challenges` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`delivered_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed_at` text,
	`consumption_id` text,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `email_challenge_invitation_idx` ON `email_challenges` (`invitation_id`);--> statement-breakpoint
CREATE INDEX `email_challenge_expiry_idx` ON `email_challenges` (`expires_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` text;