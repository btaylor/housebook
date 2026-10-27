import type { ItemInput } from '../items';

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
