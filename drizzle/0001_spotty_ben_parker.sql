CREATE TABLE `cyberus_scans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`repository_url` text NOT NULL,
	`repository_name` text NOT NULL,
	`default_branch` text NOT NULL,
	`file_count` integer NOT NULL,
	`source_files_checked` integer NOT NULL,
	`languages` text DEFAULT '[]' NOT NULL,
	`findings` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL
);
