import { fail, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../../lib/server/core';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const form = await request.formData();
		const values = {
			name: String(form.get('name') ?? ''),
			phone: String(form.get('phone') ?? ''),
			email: String(form.get('email') ?? ''),
			trade: String(form.get('trade') ?? ''),
			notes: String(form.get('notes') ?? '')
		};
		let contractor;
		try {
			contractor = locals.housebook.contractors.create(values);
		} catch (error) {
			if (error instanceof DomainError) {
				return fail(400, { code: error.code, message: error.message, values });
			}
			throw error;
		}
		redirect(303, `/contractors/${contractor.id}`);
	}
};
