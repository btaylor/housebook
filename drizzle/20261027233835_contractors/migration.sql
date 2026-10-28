CREATE TABLE `contractors` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`trade` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archivedAt` integer
);
