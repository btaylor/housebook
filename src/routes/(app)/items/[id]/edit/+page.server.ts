import { error, fail, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../../../lib/server/core';
import { itemFormValues } from '../../../../../lib/server/item-form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const item = locals.housebook.items.get(params.id);
	if (!item) error(404, 'Item not found.');
	return { item };
};

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		const values = itemFormValues(await request.formData());
		try {
			locals.housebook.items.update(params.id, values);
		} catch (cause) {
			if (cause instanceof DomainError) {
				if (cause.code === 'item-not-found') error(404, cause.message);
				return fail(400, { message: cause.message, values });
			}
			throw cause;
		}
		redirect(303, `/items/${params.id}`);
	}
};
