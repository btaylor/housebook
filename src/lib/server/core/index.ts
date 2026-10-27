import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';

export class Housebook {
	constructor(
		readonly database: NodeSQLiteDatabase,
		readonly dataDirectory: string,
		readonly clock: () => Date
	) {}
}
