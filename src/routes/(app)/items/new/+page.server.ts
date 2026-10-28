import { fail, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../../lib/server/core';
import { itemFormValues, photoFromForm } from '../../../../lib/server/item-form';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const form = await request.formData();
		const values = itemFormValues(form);
		const photo = photoFromForm(form);
		let item;
		try {
			item = photo?.name
				? await locals.housebook.items.createWithPhoto(values, photo)
				: locals.housebook.items.create(values);
		} catch (error) {
			if (error instanceof DomainError) return fail(400, { message: error.message, values });
			throw error;
		}
		redirect(303, `/items/${item.id}`);
	}
};
