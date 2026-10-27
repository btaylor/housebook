import { fail, redirect } from '@sveltejs/kit';
import { currencies, DomainError } from '../../lib/server/core';
import { setSessionCookie } from '../../lib/server/session-cookie';
import type { Actions } from './$types';

export const load = () => {
	const names = new Intl.DisplayNames(['en'], { type: 'currency' });
	return {
		currencies: currencies
			.map((code) => ({ code, name: names.of(code) ?? code }))
			.sort((a, b) => a.name.localeCompare(b.name, 'en'))
	};
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const values = {
			houseName: String(form.get('houseName') ?? ''),
			currency: String(form.get('currency') ?? ''),
			memberName: String(form.get('memberName') ?? ''),
			email: String(form.get('email') ?? '')
		};
		try {
			const session = await event.locals.housebook.setup.complete({
				...values,
				code: String(form.get('code') ?? ''),
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
