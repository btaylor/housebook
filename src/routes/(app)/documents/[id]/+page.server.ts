import { error, fail, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../../lib/server/core';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	try {
		const document = locals.housebook.documents.get(params.id);
		return { document };
	} catch (cause) {
		if (cause instanceof DomainError) error(404, cause.message);
		throw cause;
	}
};

export const actions: Actions = {
	rename: async ({ locals, params, request }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '');
		try {
			locals.housebook.documents.rename(params.id, title);
			return { message: 'Document renamed.' };
		} catch (cause) {
			if (cause instanceof DomainError) return fail(400, { error: cause.message, title });
			throw cause;
		}
	},
	delete: ({ locals, params }) => {
		let itemId: string | null;
		try {
			itemId = locals.housebook.documents.get(params.id).itemId;
			locals.housebook.documents.delete(params.id);
		} catch (cause) {
			if (cause instanceof DomainError) return fail(404, { error: cause.message });
			throw cause;
		}
		redirect(303, itemId ? `/items/${itemId}` : '/items');
	}
};
