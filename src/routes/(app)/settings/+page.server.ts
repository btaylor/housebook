import { fail, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../lib/server/core';
import { sessionCookie } from '../../../lib/server/session-cookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, cookies }) => ({
	sessions: locals.housebook.auth.listSessions(cookies.get(sessionCookie) ?? '')
});

function formError(error: unknown, section: string) {
	if (!(error instanceof DomainError)) throw error;
	if (error.code === 'session-required') redirect(303, '/sign-in');
	return fail(400, { section, message: error.message });
}

export const actions: Actions = {
	profile: async ({ locals, cookies, request }) => {
		const form = await request.formData();
		try {
			locals.member = locals.housebook.auth.updateProfile(cookies.get(sessionCookie) ?? '', {
				name: String(form.get('name') ?? ''),
				email: String(form.get('email') ?? '')
			});
		} catch (error) {
			return formError(error, 'profile');
		}
		return { section: 'profile', saved: true };
	},
	password: async ({ locals, cookies, request }) => {
		const form = await request.formData();
		try {
			await locals.housebook.auth.changePassword(
				cookies.get(sessionCookie) ?? '',
				String(form.get('currentPassword') ?? ''),
				String(form.get('newPassword') ?? '')
			);
		} catch (error) {
			return formError(error, 'password');
		}
		return { section: 'password', saved: true };
	},
	house: async ({ locals, cookies, request }) => {
		const form = await request.formData();
		try {
			locals.housebook.renameHouse(
				cookies.get(sessionCookie) ?? '',
				String(form.get('houseName') ?? '')
			);
		} catch (error) {
			return formError(error, 'house');
		}
		return { section: 'house', saved: true };
	},
	signOutAll: ({ locals, cookies, url }) => {
		try {
			locals.housebook.auth.signOutAll(cookies.get(sessionCookie) ?? '');
		} catch (error) {
			return formError(error, 'sessions');
		}
		cookies.delete(sessionCookie, { path: '/', secure: url.protocol === 'https:' });
		redirect(303, '/sign-in');
	}
};
