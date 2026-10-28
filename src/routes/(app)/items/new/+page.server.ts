import { fail, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../../lib/server/core';
import { itemFormValues } from '../../../../lib/server/item-form';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const values = itemFormValues(await request.formData());
		let item;
		try {
			item = locals.housebook.items.create(values);
		} catch (error) {
			if (error instanceof DomainError) return fail(400, { message: error.message, values });
			throw error;
		}
		redirect(303, `/items/${item.id}`);
	}
};
