import { randomUUID } from 'node:crypto';
import { createReadStream, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { documents, items, storedFiles } from '../schema';
import { DomainError } from './errors';
import { validateFile } from './validate-file';

const maxSize = 25 * 1024 * 1024;
type StoredFile = typeof storedFiles.$inferSelect;

function contentType(data: Buffer) {
	if (data.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
	if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
	if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
		return 'image/png';
	}
	if (data.subarray(4, 8).toString() === 'ftyp') {
		const boxSize = data.readUInt32BE(0);
		if (boxSize >= 16 && boxSize <= data.length) {
			const brands = [data.subarray(8, 12).toString()];
			for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
				brands.push(data.subarray(offset, offset + 4).toString());
			}
			if (brands.some((brand) => ['heic', 'heix', 'hevc', 'hevx'].includes(brand))) {
				return 'image/heic';
			}
		}
	}
	throw new DomainError('unsupported-file-type', 'Use a PDF, JPEG, PNG, or HEIC Document.');
}

export class Files {
	private directory: string;

	constructor(
		private database: NodeSQLiteDatabase,
		dataDirectory: string
	) {
		this.directory = join(dataDirectory, 'files');
		mkdirSync(this.directory, { recursive: true, mode: 0o700 });
		this.removeUnused();
		const names = new Set(
			database
				.select()
				.from(storedFiles)
				.all()
				.map((file) => file.storedName)
		);
		for (const name of readdirSync(this.directory)) {
			if (!names.has(name)) rmSync(join(this.directory, name), { force: true });
		}
	}

	async save<T>(upload: File, imageOnly: boolean, attach: (file: StoredFile) => T): Promise<T> {
		if (!upload?.name || !upload.size) {
			throw new DomainError('upload-required', 'Choose a Document or photo to upload.');
		}
		if (upload.size > maxSize) {
			throw new DomainError('file-too-large', 'Use a file of 25 MB or less.');
		}
		let data = Buffer.from(await upload.arrayBuffer());
		if (data.length > maxSize) {
			throw new DomainError('file-too-large', 'Use a file of 25 MB or less.');
		}
		let type = contentType(data);
		if (imageOnly && type === 'application/pdf') {
			throw new DomainError('photo-required', 'Use a JPEG, PNG, or HEIC photo.');
		}
		if (type === 'image/heic') {
			try {
				const { convertHeic } = await import('./heic');
				data = Buffer.from(convertHeic(data));
				type = 'image/jpeg';
			} catch {
				throw new DomainError(
					'invalid-file',
					'This HEIC photo could not be read. Try another photo.'
				);
			}
			if (data.length > maxSize) {
				throw new DomainError(
					'file-too-large',
					'The converted photo exceeds 25 MB. Use a smaller photo.'
				);
			}
		}
		await validateFile(data, type);
		const id = randomUUID();
		const extension = type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg';
		const file: StoredFile = {
			id,
			storedName: `${id}.${extension}`,
			originalName: upload.name,
			contentType: type,
			size: data.length
		};
		const path = join(this.directory, file.storedName);
		writeFileSync(path, data, { flag: 'wx', mode: 0o600 });
		let result!: T;
		try {
			this.database.transaction(() => {
				this.database.insert(storedFiles).values(file).run();
				result = attach(file);
			});
		} catch (error) {
			rmSync(path, { force: true });
			throw error;
		}
		this.removeUnused();
		return result;
	}

	open(id: string) {
		const file = this.database.select().from(storedFiles).where(eq(storedFiles.id, id)).get();
		if (!file) throw new DomainError('document-not-found', 'Document not found.');
		return { ...file, stream: createReadStream(join(this.directory, file.storedName)) };
	}

	removeUnused() {
		const unused = this.database
			.select()
			.from(storedFiles)
			.where(
				sql`NOT EXISTS (SELECT 1 FROM ${items} WHERE ${items.photoId} = ${storedFiles.id})
				AND NOT EXISTS (SELECT 1 FROM ${documents} WHERE ${documents.fileId} = ${storedFiles.id})`
			)
			.all();
		// Keep metadata until unlink succeeds, so startup can retry an interrupted cleanup.
		for (const file of unused) {
			rmSync(join(this.directory, file.storedName), { force: true });
			this.database.delete(storedFiles).where(eq(storedFiles.id, file.id)).run();
		}
	}
}
