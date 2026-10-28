declare module 'libheif-js' {
	interface Resource {
		delete(): void;
	}
	interface Failure {
		code: { value: number };
	}
	interface DecodedImage {
		image: Resource;
		channels: {
			id: { value: number };
			width: number;
			height: number;
			stride: number;
			data: Uint8Array;
		}[];
	}
	const libheif: {
		heif_context_alloc(): Resource | null;
		heif_context_read_from_memory(context: Resource, data: Uint8Array): Failure;
		heif_js_context_get_primary_image_handle(context: Resource): Resource | Failure;
		heif_js_decode_image2(
			handle: Resource,
			colorspace: { value: number },
			chroma: { value: number }
		): DecodedImage | Failure;
		heif_image_release(image: Resource): void;
		heif_image_handle_release(handle: Resource): void;
		heif_context_free(context: Resource): void;
		heif_colorspace: { heif_colorspace_RGB: { value: number } };
		heif_chroma: { heif_chroma_interleaved_RGBA: { value: number } };
		heif_channel: { heif_channel_interleaved: { value: number } };
	};
	export default libheif;
}
