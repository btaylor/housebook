CREATE TABLE `documents` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`fileId` text NOT NULL UNIQUE,
	`itemId` text,
	`serviceRecordId` text,
	CONSTRAINT `fk_documents_fileId_stored_files_id_fk` FOREIGN KEY (`fileId`) REFERENCES `stored_files`(`id`),
	CONSTRAINT `fk_documents_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE CASCADE,
	CONSTRAINT "document_one_owner" CHECK(("itemId" IS NOT NULL) + ("serviceRecordId" IS NOT NULL) = 1)
);
--> statement-breakpoint
CREATE TABLE `stored_files` (
	`id` text PRIMARY KEY,
	`originalName` text NOT NULL,
	`storedName` text NOT NULL UNIQUE,
	`contentType` text NOT NULL,
	`size` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `items` ADD `photoId` text REFERENCES stored_files(id);--> statement-breakpoint
CREATE INDEX `documents_item` ON `documents` (`itemId`);