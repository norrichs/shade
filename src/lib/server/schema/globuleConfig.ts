import { relations } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name')
});

export const globuleConfigs = sqliteTable('globuleConfigs', {
	id: integer('id').primaryKey(),
	name: text('name')
});

export const globuleConfigRelations = relations(globuleConfigs, ({ many }) => ({
	silhouetteConfig: many(silhouetteConfigs, {
		relationName: 'silhouetteConfig'
	}),
	depthCurveConfig: many(depthCurveConfigs, {
		relationName: 'depthCurveConfig'
	}),
	shapeConfig: many(shapeConfigs, {
		relationName: 'shapeConfig'
	}),
	levelConfig: many(levelConfigs, {
		relationName: 'levelConfig'
	}),
	renderConfig: many(renderConfigs, {
		relationName: 'renderConfig'
	}),
	spineCurveConfig: many(spineCurveConfigs, {
		relationName: 'spineCurveConfig'
	}),
	bandConfig: many(bandConfigs, {
		relationName: 'bandConfig'
	}),
	strutConfig: many(strutConfigs, {
		relationName: 'strutConfig'
	})
}));

export const silhouetteConfigs = sqliteTable('silhouetteConfigs', {
	id: integer('id').primaryKey(),
	curves: text('curves', { mode: 'json' }),
	globuleConfigId: integer('globuleConfigId').references(() => globuleConfigs.id, {
		onDelete: 'cascade'
	})
});

export const silhouetteConfigsRelations = relations(silhouetteConfigs, ({ one }) => ({
	globuleConfig: one(globuleConfigs, {
		fields: [silhouetteConfigs.globuleConfigId],
		references: [globuleConfigs.id],
		relationName: 'silhouetteConfig'
	})
}));

export const depthCurveConfigs = sqliteTable('depthCurveConfigs', {
	id: integer('id').primaryKey(),
	depthCurveBaseline: integer('depthCurveBaseline'),
	curves: text('curves', { mode: 'json' }),
	globuleConfigId: integer('globuleConfigId').references(() => globuleConfigs.id, {
		onDelete: 'cascade'
	})
});

export const depthCurveConfigsRelations = relations(depthCurveConfigs, ({ one }) => ({
	globuleConfig: one(globuleConfigs, {
		fields: [depthCurveConfigs.globuleConfigId],
		references: [globuleConfigs.id],
		relationName: 'depthCurveConfig'
	})
}));

export const shapeConfigs = sqliteTable('shapeConfigs', {
	id: integer('id').primaryKey(),
	symmetry: text('symmetry'),
	symmetryNumber: integer('symmetryNumber'),
	sampleMethod: text('sampleMethod'),
	sampleMethodDivisions: integer('sampleMethodDivisions'),
	curves: text('curves', { mode: 'json' }),
	globuleConfigId: integer('globuleConfigId').references(() => globuleConfigs.id, {
		onDelete: 'cascade'
	})
});

export const shapeConfigsRelations = relations(shapeConfigs, ({ one }) => ({
	globuleConfig: one(globuleConfigs, {
		fields: [shapeConfigs.globuleConfigId],
		references: [globuleConfigs.id],
		relationName: 'shapeConfig'
	})
}));

export const levelConfigs = sqliteTable('levelConfigs', {
	id: integer('id').primaryKey(),
	silhouetteSampleMethod: text('silhouetteSampleMethod'),
	silhouetteSampleMethodDivisions: integer('silhouetteSampleMethodDivisions'),
	levelPrototypeSampleMethod: text('levelPrototypeSampleMethod'),

	globuleConfigId: integer('globuleConfigId').references(() => globuleConfigs.id, {
		onDelete: 'cascade'
	})
});

export const levelConfigRelations = relations(levelConfigs, ({ one, many }) => ({
	globuleConfig: one(globuleConfigs, {
		fields: [levelConfigs.globuleConfigId],
		references: [globuleConfigs.id],
		relationName: 'levelConfig'
	}),
	levelOffsets: many(levelOffsets, {
		relationName: 'levelOffset'
	})
}));

export const levelOffsets = sqliteTable('levelOffsets', {
	id: integer('id').primaryKey(),
	x: real('x'),
	y: real('y'),
	z: real('z'),
	rotX: real('rotX'),
	rotY: real('rotY'),
	rotZ: real('rotZ'),
	scaleX: real('scaleX'),
	scaleY: real('scaleY'),
	depth: real('depth'),
	levelConfigId: integer('levelConfigId').references(() => levelConfigs.id, { onDelete: 'cascade' })
});

export const levelOffsetsRelations = relations(levelOffsets, ({ one }) => ({
	levelConfig: one(levelConfigs, {
		fields: [levelOffsets.levelConfigId],
		references: [levelConfigs.id],
		relationName: 'levelOffset'
	})
}));

export const renderConfigs = sqliteTable('renderConfigs', {
	id: integer('id').primaryKey(),
	globuleConfigId: integer('globuleConfigId').references(() => globuleConfigs.id, {
		onDelete: 'cascade'
	}),
	rangeStyle: text('rangeStyle'),
	bandStart: integer('bandStart'),
	bandCount: integer('bandCount'),
	facetStart: integer('facetStart'),
	facetCount: integer('facetCount'),
	levelStart: integer('levelStart'),
	levelCount: integer('levelCount'),
	strutStart: integer('strutStart'),
	strutCount: integer('strutCount'),
	tabs: integer('tabs', { mode: 'boolean' }),
	levels: integer('levels', { mode: 'boolean' }),
	bands: integer('bands', { mode: 'boolean' }),
	edges: integer('edges', { mode: 'boolean' }),
	patterns: integer('patterns', { mode: 'boolean' }),
	struts: integer('struts', { mode: 'boolean' })
});

export const renderConfigsRelations = relations(renderConfigs, ({ one }) => ({
	globuleConfig: one(globuleConfigs, {
		fields: [renderConfigs.globuleConfigId],
		references: [globuleConfigs.id],
		relationName: 'renderConfig'
	})
}));

export const spineCurveConfigs = sqliteTable('spineCurveConfigs', {
	id: integer('id').primaryKey(),
	curves: text('curves', { mode: 'json' }),
	globuleConfigId: integer('globuleConfigId').references(() => globuleConfigs.id, {
		onDelete: 'cascade'
	})
});

export const spineCurveConfigsRelations = relations(spineCurveConfigs, ({ one }) => ({
	globuleConfig: one(globuleConfigs, {
		fields: [spineCurveConfigs.globuleConfigId],
		references: [globuleConfigs.id],
		relationName: 'spineCurveConfig'
	})
}));

export const bandConfigs = sqliteTable('bandConfigs', {
	id: integer('id').primaryKey(),
	globuleConfigId: integer('globuleConfigId').references(() => globuleConfigs.id, {
		onDelete: 'cascade'
	}),
	bandStyle: text('bandStyle'),
	offsetBy: integer('offsetBy'),
	tabStyle: text('tabStyle', { mode: 'json' })
});

export const bandConfigsRelations = relations(bandConfigs, ({ one }) => ({
	globuleConfig: one(globuleConfigs, {
		fields: [bandConfigs.globuleConfigId],
		references: [globuleConfigs.id],
		relationName: 'bandConfig'
	})
}));

export const strutConfigs = sqliteTable('strutConfigs', {
	id: integer('id').primaryKey(),
	globuleConfigId: integer('globuleConfigId').references(() => globuleConfigs.id, {
		onDelete: 'cascade'
	}),
	tiling: text('tiling'),
	orientation: text('orientation'),
	radiate: text('radiate'),
	width: real('width')
});

export const strutConfigsRelations = relations(strutConfigs, ({ one }) => ({
	globuleConfig: one(globuleConfigs, {
		fields: [strutConfigs.globuleConfigId],
		references: [globuleConfigs.id],
		relationName: 'strutConfig'
	})
}));