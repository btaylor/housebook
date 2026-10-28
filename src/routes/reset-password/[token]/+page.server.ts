import { fail } from '@sveltejs/kit';
import { DomainError } from '../../../lib/server/core';
import { sessionCookie } from '../../../lib/server/session-cookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, setHeaders }) => {
	setHeaders({ 'referrer-policy': 'strict-origin' });
	return { valid: locals.housebook.auth.isPasswordResetValid(params.token) };
};

export const actions: Actions = {
	default: async ({ locals, params, request, cookies, url }) => {
		const form = await request.formData();
		try {
			await locals.housebook.auth.resetPassword(params.token, String(form.get('password') ?? ''));
			const token = cookies.get(sessionCookie);
			if (token && !locals.housebook.auth.validateSession(token)) {
				cookies.delete(sessionCookie, { path: '/', secure: url.protocol === 'https:' });
			}
		} catch (error) {
			if (error instanceof DomainError) return fail(400, { message: error.message });
			throw error;
		}
		return { reset: true };
	}
};
