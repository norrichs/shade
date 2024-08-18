CREATE TABLE `bands` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`globule_id` integer,
	FOREIGN KEY (`globule_id`) REFERENCES `globules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `facets` (
	`id` integer PRIMARY KEY NOT NULL,
	`band_id` integer,
	`triangle` text,
	`tab` text,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `globules` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text
);
--> statement-breakpoint
CREATE TABLE `bandConfigs` (
	`id` integer PRIMARY KEY NOT NULL,
	`globuleConfigId` integer,
	`bandStyle` text,
	`offsetBy` integer,
	`tabStyle` text,
	FOREIGN KEY (`globuleConfigId`) REFERENCES `globuleConfigs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `depthCurveConfigs` (
	`id` integer PRIMARY KEY NOT NULL,
	`depthCurveBaseline` integer,
	`curves` text,
	`globuleConfigId` integer,
	FOREIGN KEY (`globuleConfigId`) REFERENCES `globuleConfigs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `globuleConfigs` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text
);
--> statement-breakpoint
CREATE TABLE `levelConfigs` (
	`id` integer PRIMARY KEY NOT NULL,
	`silhouetteSampleMethod` text,
	`silhouetteSampleMethodDivisions` integer,
	`levelPrototypeSampleMethod` text,
	`globuleConfigId` integer,
	FOREIGN KEY (`globuleConfigId`) REFERENCES `globuleConfigs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `levelOffsets` (
	`id` integer PRIMARY KEY NOT NULL,
	`x` real,
	`y` real,
	`z` real,
	`rotX` real,
	`rotY` real,
	`rotZ` real,
	`scaleX` real,
	`scaleY` real,
	`depth` real,
	`levelConfigId` integer,
	FOREIGN KEY (`levelConfigId`) REFERENCES `levelConfigs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `renderConfigs` (
	`id` integer PRIMARY KEY NOT NULL,
	`globuleConfigId` integer,
	`rangeStyle` text,
	`bandStart` integer,
	`bandCount` integer,
	`facetStart` integer,
	`facetCount` integer,
	`levelStart` integer,
	`levelCount` integer,
	`strutStart` integer,
	`strutCount` integer,
	`tabs` integer,
	`levels` integer,
	`bands` integer,
	`edges` integer,
	`patterns` integer,
	`struts` integer,
	FOREIGN KEY (`globuleConfigId`) REFERENCES `globuleConfigs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shapeConfigs` (
	`id` integer PRIMARY KEY NOT NULL,
	`symmetry` text,
	`symmetryNumber` integer,
	`sampleMethod` text,
	`sampleMethodDivisions` integer,
	`curves` text,
	`globuleConfigId` integer,
	FOREIGN KEY (`globuleConfigId`) REFERENCES `globuleConfigs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `silhouetteConfigs` (
	`id` integer PRIMARY KEY NOT NULL,
	`curves` text,
	`globuleConfigId` integer,
	FOREIGN KEY (`globuleConfigId`) REFERENCES `globuleConfigs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `spineCurveConfigs` (
	`id` integer PRIMARY KEY NOT NULL,
	`curves` text,
	`globuleConfigId` integer,
	FOREIGN KEY (`globuleConfigId`) REFERENCES `globuleConfigs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `strutConfigs` (
	`id` integer PRIMARY KEY NOT NULL,
	`globuleConfigId` integer,
	`tiling` text,
	`orientation` text,
	`radiate` text,
	`width` real,
	FOREIGN KEY (`globuleConfigId`) REFERENCES `globuleConfigs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nameIdx` ON `globules` (`name`);