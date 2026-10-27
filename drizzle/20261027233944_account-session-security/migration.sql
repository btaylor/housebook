CREATE TABLE `sign_in_attempts` (
	`id` integer PRIMARY KEY,
	`memberId` text NOT NULL,
	`attemptedAt` integer NOT NULL,
	CONSTRAINT `fk_sign_in_attempts_memberId_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `members` ADD `signInLockedUntil` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `deviceHint` text DEFAULT 'Unknown browser · Unknown device' NOT NULL;--> statement-breakpoint
CREATE INDEX `sign_in_attempts_member_time` ON `sign_in_attempts` (`memberId`,`attemptedAt`);