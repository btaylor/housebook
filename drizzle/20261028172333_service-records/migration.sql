CREATE TABLE `service_record_items` (
	`serviceRecordId` text NOT NULL,
	`itemId` text NOT NULL,
	CONSTRAINT `service_record_items_pk` PRIMARY KEY(`serviceRecordId`, `itemId`),
	CONSTRAINT `fk_service_record_items_serviceRecordId_service_records_id_fk` FOREIGN KEY (`serviceRecordId`) REFERENCES `service_records`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_service_record_items_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `service_records` (
	`id` text PRIMARY KEY,
	`date` text NOT NULL,
	`notes` text NOT NULL,
	`costCents` integer,
	`contractorId` text,
	`memberId` text,
	CONSTRAINT `fk_service_records_contractorId_contractors_id_fk` FOREIGN KEY (`contractorId`) REFERENCES `contractors`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_service_records_memberId_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "service_record_performer" CHECK(("contractorId" IS NOT NULL) != ("memberId" IS NOT NULL)),
	CONSTRAINT "service_record_cost" CHECK("costCents" IS NULL OR (typeof("costCents") = 'integer' AND "costCents" BETWEEN 0 AND 9007199254740991))
);
--> statement-breakpoint
CREATE INDEX `service_record_items_item` ON `service_record_items` (`itemId`);--> statement-breakpoint
CREATE INDEX `service_records_date` ON `service_records` (`date`);--> statement-breakpoint
CREATE INDEX `service_records_contractor` ON `service_records` (`contractorId`);