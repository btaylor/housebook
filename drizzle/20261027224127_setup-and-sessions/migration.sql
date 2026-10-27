CREATE TABLE `houses` (
	`id` integer PRIMARY KEY DEFAULT 1,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`createdAt` integer NOT NULL,
	CONSTRAINT "single_house" CHECK("id" = 1)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`passwordHash` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`tokenHash` text PRIMARY KEY,
	`memberId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`lastSeenAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	CONSTRAINT `fk_sessions_memberId_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (lower("email"));