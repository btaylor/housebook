import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { documents, items, storedFiles } from '../schema';
import { DomainError } from './errors';
import type { Files } from './files';

function documentTitle(title: string) {
	const value = title.trim();
	if (!value) throw new DomainError('invalid-document-title', 'Enter a Document title.');
	return value;
}

export class Documents {
	constructor(
		private database: NodeSQLiteDatabase,
		private files: Files
	) {}

	async addToItem(itemId: string, title: string, upload: File) {
		const value = documentTitle(title);
		this.requireItem(itemId);
		return this.files.save(upload, false, (file) => {
			this.requireItem(itemId);
			return this.database
				.insert(documents)
				.values({ id: randomUUID(), title: value, itemId, fileId: file.id })
				.returning()
				.get();
		});
	}

	listForItem(itemId: string) {
		this.requireItem(itemId);
		return this.database
			.select({
				id: documents.id,
				title: documents.title,
				originalName: storedFiles.originalName,
				contentType: storedFiles.contentType,
				size: storedFiles.size
			})
			.from(documents)
			.innerJoin(storedFiles, eq(documents.fileId, storedFiles.id))
			.where(eq(documents.itemId, itemId))
			.orderBy(asc(documents.title), asc(documents.id))
			.all();
	}

	rename(id: string, title: string) {
		this.get(id);
		return this.database
			.update(documents)
			.set({ title: documentTitle(title) })
			.where(eq(documents.id, id))
			.returning()
			.get()!;
	}

	delete(id: string) {
		this.get(id);
		this.database.delete(documents).where(eq(documents.id, id)).run();
		this.files.removeUnused();
	}

	open(id: string) {
		const document = this.get(id);
		return { title: document.title, ...this.files.open(document.fileId) };
	}

	get(id: string) {
		const document = this.database.select().from(documents).where(eq(documents.id, id)).get();
		if (!document) throw new DomainError('document-not-found', 'Document not found.');
		const file = this.database
			.select()
			.from(storedFiles)
			.where(eq(storedFiles.id, document.fileId))
			.get()!;
		return { ...file, ...document };
	}

	private requireItem(id: string) {
		if (!this.database.select({ id: items.id }).from(items).where(eq(items.id, id)).get()) {
			throw new DomainError('item-not-found', 'Item not found.');
		}
	}
}
