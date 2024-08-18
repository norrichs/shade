import { relations } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const globules = sqliteTable(
	'globules',
	{
		id: integer('id').primaryKey(),
		name: text('name')
	},
	(globules) => ({
		nameIdx: uniqueIndex('nameIdx').on(globules.name)
	})
);

export const globulesRelations = relations(globules, ({ many }) => ({
	bands: many(bands)
}));

export const bands = sqliteTable('bands', {
	id: integer('id').primaryKey(),
	name: text('name'),
	globuleId: integer('globule_id').references(() => globules.id)
});

export const bandsRelations = relations(bands, ({ one, many }) => ({
	globule: one(globules, {
		fields: [bands.globuleId],
		references: [globules.id]
	}),
	facets: many(facets)
}));

export const facets = sqliteTable('facets', {
	id: integer('id').primaryKey(),
	bandId: integer('band_id').references(() => bands.id),
	triangle: text('triangle', { mode: 'json' }),
	tab: text('tab', { mode: 'json' })
});

export const facetsRelations = relations(facets, ({ one }) => ({
	band: one(bands, {
		fields: [facets.bandId],
		references: [bands.id]
	})
}));
