import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const questions = sqliteTable('questions', {
	id: text('id').primaryKey(),
	question: text('question').notNull(),
	deleteId: text('delete_id').notNull(),
	expireDate: integer('expire_date').notNull(),
	createdAt: integer('created_at')
		.notNull()
		.default(sql`(cast (unixepoch() as int))`)
});

export const questionRelations = relations(questions, ({ many }) => ({
	choices: many(choices)
}));

export const choices = sqliteTable('choices', {
	id: text('id').primaryKey(),
	choice: text('choice').notNull(),
	questionId: text('question_id')
		.notNull()
		.references(() => questions.id)
});

export const choicesRelations = relations(choices, ({ one, many }) => ({
	question: one(questions, {
		fields: [choices.questionId],
		references: [questions.id]
	}),
	votes: many(votes)
}));

export const votes = sqliteTable('votes', {
	id: text('id').primaryKey(),
	choiceId: text('choice_id')
		.notNull()
		.references(() => choices.id),
	country: text('country').notNull().default('unknown'),
	voterId: text('voterId').notNull(),
	createdAt: integer('created_at')
		.notNull()
		.default(sql`(cast (unixepoch() as int))`)
});

export const votesRelations = relations(votes, ({ one }) => ({
	choice: one(choices, {
		fields: [votes.choiceId],
		references: [choices.id]
	})
}));
