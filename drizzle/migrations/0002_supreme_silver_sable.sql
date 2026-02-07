CREATE TABLE `shades_configs` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`config_json` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
DROP TABLE `bands`;--> statement-breakpoint
DROP TABLE `facets`;--> statement-breakpoint
DROP TABLE `globules`;--> statement-breakpoint
DROP TABLE `bandConfigs`;--> statement-breakpoint
DROP TABLE `depthCurveConfigs`;--> statement-breakpoint
DROP TABLE `globuleConfigs`;--> statement-breakpoint
DROP TABLE `levelConfigs`;--> statement-breakpoint
DROP TABLE `levelOffsets`;--> statement-breakpoint
DROP TABLE `renderConfigs`;--> statement-breakpoint
DROP TABLE `shapeConfigs`;--> statement-breakpoint
DROP TABLE `silhouetteConfigs`;--> statement-breakpoint
DROP TABLE `spineCurveConfigs`;--> statement-breakpoint
DROP TABLE `strutConfigs`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
DROP TABLE `subGlobuleConfigs`;--> statement-breakpoint
DROP TABLE `superGlobuleConfigs`;