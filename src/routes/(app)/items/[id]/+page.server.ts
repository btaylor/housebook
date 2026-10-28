import { error, fail } from '@sveltejs/kit';
import { DomainError } from '../../../../lib/server/core';
import { photoFromForm } from '../../../../lib/server/item-form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const item = locals.housebook.items.get(params.id);
	if (!item) error(404, 'Item not found.');
	return {
		item,
		records: locals.housebook.serviceRecords.list({ itemId: params.id }),
		documents: locals.housebook.documents.listForItem(params.id)
	};
};

export const actions: Actions = {
	photo: async ({ locals, params, request }) => {
		try {
			const form = await request.formData();
			await locals.housebook.items.setPhoto(params.id, photoFromForm(form) ?? new File([], ''));
			return { message: 'Photo saved.' };
		} catch (cause) {
			if (cause instanceof DomainError) return fail(400, { error: cause.message });
			throw cause;
		}
	},
	removePhoto: ({ locals, params }) => {
		try {
			locals.housebook.items.removePhoto(params.id);
			return { message: 'Photo removed.' };
		} catch (cause) {
			if (cause instanceof DomainError) return fail(400, { error: cause.message });
			throw cause;
		}
	},
	document: async ({ locals, params, request }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '');
		try {
			const upload = form.get('document');
			await locals.housebook.documents.addToItem(
				params.id,
				title,
				upload instanceof File ? upload : new File([], '')
			);
			return { message: 'Document attached.' };
		} catch (cause) {
			if (cause instanceof DomainError) return fail(400, { error: cause.message, title });
			throw cause;
		}
	}
};
