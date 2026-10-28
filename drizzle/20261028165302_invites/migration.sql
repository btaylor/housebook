CREATE TABLE `invites` (
	`id` text PRIMARY KEY,
	`tokenHash` text NOT NULL UNIQUE,
	`createdBy` text NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	`revokedAt` integer,
	CONSTRAINT `fk_invites_createdBy_members_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `members`(`id`)
);
