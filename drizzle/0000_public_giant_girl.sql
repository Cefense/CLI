CREATE TABLE `cyberus_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cyberus_profiles` (
	`email` text PRIMARY KEY NOT NULL,
	`full_name` text,
	`company` text DEFAULT '' NOT NULL,
	`plan` text DEFAULT 'signal' NOT NULL,
	`stack` text DEFAULT '' NOT NULL,
	`repository_url` text DEFAULT '' NOT NULL,
	`watchlist` text DEFAULT '[]' NOT NULL,
	`onboarding_complete` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
