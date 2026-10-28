import { Readable } from 'node:stream';

export function fileResponse(
	file: {
		stream: Readable;
		contentType: string;
		originalName: string;
		storedName: string;
		size: number;
	},
	download = false
) {
	const extension = file.storedName.split('.').at(-1)!;
	const name = file.originalName.replace(/\.[^.]*$/, '') + `.${extension}`;
	const encoded = encodeURIComponent(name).replace(
		/['()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
	);
	return new Response(Readable.toWeb(file.stream) as ReadableStream<Uint8Array>, {
		headers: {
			'content-type': file.contentType,
			'content-length': String(file.size),
			'content-disposition': `${download ? 'attachment' : 'inline'}; filename="document.${extension}"; filename*=UTF-8''${encoded}`,
			'x-content-type-options': 'nosniff',
			'content-security-policy': "sandbox; default-src 'none'"
		}
	});
}
