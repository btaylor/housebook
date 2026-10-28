import { encode } from 'jpeg-js';
import libheif from 'libheif-js';

export function convertHeic(data: Uint8Array) {
	const context = libheif.heif_context_alloc();
	if (!context) throw new Error('HEIC context could not be allocated.');
	let handle;
	let image;
	try {
		if (libheif.heif_context_read_from_memory(context, data).code.value !== 0) {
			throw new Error('Invalid HEIC content.');
		}
		const primary = libheif.heif_js_context_get_primary_image_handle(context);
		if ('code' in primary) throw new Error('HEIC has no primary image.');
		handle = primary;
		const decoded = libheif.heif_js_decode_image2(
			handle,
			libheif.heif_colorspace.heif_colorspace_RGB,
			libheif.heif_chroma.heif_chroma_interleaved_RGBA
		);
		if ('code' in decoded) throw new Error('HEIC image could not be decoded.');
		image = decoded.image;
		const channel = decoded.channels.find(
			(channel) => channel.id.value === libheif.heif_channel.heif_channel_interleaved.value
		);
		if (!channel) throw new Error('HEIC has no image pixels.');
		const { width, height, stride } = channel;
		const pixels = new Uint8Array(width * height * 4);
		for (let row = 0; row < height; row++) {
			pixels.set(channel.data.subarray(row * stride, row * stride + width * 4), row * width * 4);
		}
		return encode({ width, height, data: pixels }, 90).data;
	} finally {
		if (image) libheif.heif_image_release(image);
		if (handle) libheif.heif_image_handle_release(handle);
		libheif.heif_context_free(context);
	}
}
