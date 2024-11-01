import { relations } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { globuleConfigs } from './globuleConfig';

export const superGlobuleConfigs = sqliteTable('superGlobuleConfigs', {
	id: integer('id').primaryKey(),
	name: text('name')
});

export const superGlobuleConfigRelations = relations(superGlobuleConfigs, ({ many }) => ({
	subGlobuleConfigs: many(subGlobuleConfigs, {
		relationName: 'subGlobuleConfigs'
	})
}));

export const subGlobuleConfigs = sqliteTable('subGlobuleConfigs', {
	id: integer('id').primaryKey(),
	name: text('name'),
	superGlobuleConfigId: integer('superGlobuleConfigId').references(() => superGlobuleConfigs.id, {
		onDelete: 'cascade'
	}),
	globuleConfigId: integer('globuleConfigId').references(() => globuleConfigs.id),
	transforms: text('transforms', {mode: 'json'})
});

export const subGlobuleConfigRelations = relations(subGlobuleConfigs, ({ many, one }) => ({
	superGlobuleConfig: one(superGlobuleConfigs, {
		fields: [subGlobuleConfigs.superGlobuleConfigId],
		references: [superGlobuleConfigs.id],
		relationName: 'subGlobuleConfigs'
	}),
	globuleConfig: one(globuleConfigs, {
		fields: [subGlobuleConfigs.globuleConfigId],
		references: [globuleConfigs.id],
		relationName: 'globuleConfig'
	})
}));



