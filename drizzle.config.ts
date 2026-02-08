import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

export default {
	dialect: 'turso',
	schema: './src/lib/server/schema/*',
	out: './drizzle/migrations',
	dbCredentials: {
		url: process.env.VITE_TURSO_DB_URL as string,
		authToken: process.env.VITE_TURSO_DB_AUTH_TOKEN as string
	}
} satisfies Config;
