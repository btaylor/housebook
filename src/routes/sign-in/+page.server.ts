import { fail, redirect } from '@sveltejs/kit';
import { DomainError } from '../../lib/server/core';
import { setSessionCookie } from '../../lib/server/session-cookie';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '');
		try {
			const session = await event.locals.housebook.auth.signIn(
				email,
				String(form.get('password') ?? '')
			);
			setSessionCookie(event, session);
		} catch (error) {
			if (error instanceof DomainError) return fail(400, { message: error.message, email });
			throw error;
		}
		redirect(303, '/items');
	}
};
