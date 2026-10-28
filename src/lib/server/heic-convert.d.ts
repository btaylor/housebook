declare module 'heic-convert' {
	export default function convert(input: {
		buffer: Uint8Array;
		format: 'JPEG';
		quality: number;
	}): Promise<Uint8Array>;
}
