ALTER TABLE `members` ADD `removedAt` integer;--> statement-breakpoint
DROP INDEX IF EXISTS `members_email_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `active_members_email_unique` ON `members` (lower("email")) WHERE "members"."removedAt" IS NULL;