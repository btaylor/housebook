import { error, fail } from '@sveltejs/kit';
import { DomainError } from '../../../../lib/server/core';
import { photoFromForm } from '../../../../lib/server/item-form';
import { requireSession } from '../../../../lib/server/session-cookie';
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
	photo: async (event) => {
		const { locals, params, request } = event;
		try {
			const form = await request.formData();
			requireSession(event);
			await locals.housebook.items.setPhoto(
				params.id,
				photoFromForm(form) ?? new File([], ''),
				() => requireSession(event)
			);
			return { message: 'Photo saved.' };
		} catch (cause) {
			if (cause instanceof DomainError) return fail(400, { error: cause.message });
			throw cause;
		}
	},
	removePhoto: (event) => {
		const { locals, params } = event;
		requireSession(event);
		try {
			locals.housebook.items.removePhoto(params.id);
			return { message: 'Photo removed.' };
		} catch (cause) {
			if (cause instanceof DomainError) return fail(400, { error: cause.message });
			throw cause;
		}
	},
	document: async (event) => {
		const { locals, params, request } = event;
		const form = await request.formData();
		const title = String(form.get('title') ?? '');
		requireSession(event);
		try {
			const upload = form.get('document');
			await locals.housebook.documents.addToItem(
				params.id,
				title,
				upload instanceof File ? upload : new File([], ''),
				() => requireSession(event)
			);
			return { message: 'Document attached.' };
		} catch (cause) {
			if (cause instanceof DomainError) return fail(400, { error: cause.message, title });
			throw cause;
		}
	}
};
