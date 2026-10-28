import { decode } from 'jpeg-js';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { DomainError } from './errors';

export async function validateFile(data: Buffer, type: string) {
	try {
		if (type === 'image/jpeg') {
			decode(data, { useTArray: true, tolerantDecoding: false });
		} else if (type === 'image/png') {
			PNG.sync.read(data, { checkCRC: true });
		} else if (type === 'application/pdf') {
			const tail = data.subarray(-1024).toString('latin1');
			const trailer = /startxref\s+(\d+)\s+%%EOF[\0\t\n\f\r ]*$/.exec(tail);
			if (!trailer || Number(trailer[1]) >= data.length) {
				throw new Error('PDF trailer is missing or incomplete.');
			}
			const document = await PDFDocument.load(data, {
				ignoreEncryption: true,
				throwOnInvalidObject: true,
				updateMetadata: false
			});
			if (!document.getPages().length) throw new Error('PDF has no pages.');
		}
	} catch {
		throw new DomainError(
			'invalid-file',
			'This Document or photo is damaged or incomplete. Choose a valid PDF, JPEG, PNG, or HEIC.'
		);
	}
}
