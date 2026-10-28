import { fail, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../../../lib/server/core';
import { requireSession } from '../../../../../lib/server/session-cookie';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const { locals, params, request } = event;
		const form = await request.formData();
		const values = {
			name: String(form.get('name') ?? ''),
			phone: String(form.get('phone') ?? ''),
			email: String(form.get('email') ?? ''),
			trade: String(form.get('trade') ?? ''),
			notes: String(form.get('notes') ?? '')
		};
		requireSession(event);
		try {
			locals.housebook.contractors.update(params.id, values);
		} catch (error) {
			if (error instanceof DomainError) {
				return fail(error.code === 'contractor-not-found' ? 404 : 400, {
					code: error.code,
					message: error.message,
					values
				});
			}
			throw error;
		}
		redirect(303, `/contractors/${params.id}`);
	}
};
