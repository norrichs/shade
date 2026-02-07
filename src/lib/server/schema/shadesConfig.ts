import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const shadesConfigs = sqliteTable('shades_configs', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	configJson: text('config_json').notNull(),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(datetime('now'))`),
	updatedAt: text('updated_at')
		.notNull()
		.default(sql`(datetime('now'))`)
});
