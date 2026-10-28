import { fail, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../lib/server/core';
import { setSessionCookie } from '../../../lib/server/session-cookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, setHeaders }) => {
	setHeaders({ 'referrer-policy': 'strict-origin' });
	return {
		valid: locals.housebook.invites.isValid(params.token),
		houseName: locals.housebook.setup.getHouse()!.name
	};
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const values = {
			memberName: String(form.get('memberName') ?? ''),
			email: String(form.get('email') ?? '')
		};
		try {
			const session = await event.locals.housebook.invites.redeem(event.params.token, {
				...values,
				userAgent: event.request.headers.get('user-agent') ?? '',
				password: String(form.get('password') ?? '')
			});
			setSessionCookie(event, session);
		} catch (error) {
			if (error instanceof DomainError) return fail(400, { message: error.message, values });
			throw error;
		}
		redirect(303, '/items');
	}
};
