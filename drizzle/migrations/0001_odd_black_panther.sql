CREATE TABLE `subGlobuleConfigs` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`superGlobuleConfigId` integer,
	`globuleConfigId` integer,
	`transforms` text,
	FOREIGN KEY (`superGlobuleConfigId`) REFERENCES `superGlobuleConfigs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`globuleConfigId`) REFERENCES `globuleConfigs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `superGlobuleConfigs` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text
);
