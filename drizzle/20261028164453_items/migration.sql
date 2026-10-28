CREATE TABLE `items` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`location` text,
	`make` text,
	`model` text,
	`serialNumber` text,
	`installDate` text,
	`warrantyEndDate` text,
	`notes` text,
	`retiredDate` text
);
