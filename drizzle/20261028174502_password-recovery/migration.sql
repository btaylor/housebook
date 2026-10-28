CREATE TABLE `password_resets` (
	`id` text PRIMARY KEY,
	`tokenHash` text NOT NULL UNIQUE,
	`memberId` text NOT NULL,
	`createdBy` text,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	CONSTRAINT `fk_password_resets_memberId_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_password_resets_createdBy_members_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `members`(`id`)
);
