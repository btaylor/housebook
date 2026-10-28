import type { ItemInput } from '../items';

export function photoFromForm(form: FormData) {
	const camera = form.get('cameraPhoto');
	const upload = form.get('photo');
	return camera instanceof File && camera.name ? camera : upload instanceof File ? upload : null;
}

export function itemFormValues(form: FormData): ItemInput {
	return {
		name: String(form.get('name') ?? ''),
		category: String(form.get('category') ?? ''),
		location: String(form.get('location') ?? ''),
		make: String(form.get('make') ?? ''),
		model: String(form.get('model') ?? ''),
		serialNumber: String(form.get('serialNumber') ?? ''),
		installDate: String(form.get('installDate') ?? ''),
		warrantyEndDate: String(form.get('warrantyEndDate') ?? ''),
		notes: String(form.get('notes') ?? '')
	};
}
