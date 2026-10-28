import { fail, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../lib/server/core';
import { requireSession, sessionCookie } from '../../../lib/server/session-cookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, cookies }) => ({
	members: locals.housebook.members.list(),
	invites: locals.housebook.invites.list(),
	sessions: locals.housebook.auth.listSessions(cookies.get(sessionCookie) ?? '')
});

function formError(error: unknown, section: string) {
	if (!(error instanceof DomainError)) throw error;
	if (error.code === 'session-required') redirect(303, '/sign-in');
	return fail(400, { section, message: error.message });
}

export const actions: Actions = {
	createPasswordReset: async ({ locals, cookies, request, url }) => {
		const form = await request.formData();
		try {
			return {
				reset: locals.housebook.auth.createPasswordReset(
					cookies.get(sessionCookie) ?? '',
					String(form.get('memberId') ?? ''),
					url.origin,
					process.env.HOUSEBOOK_URL
				)
			};
		} catch (error) {
			return formError(error, 'members');
		}
	},
	removeMember: async ({ locals, cookies, request, url }) => {
		const form = await request.formData();
		try {
			locals.housebook.members.remove(
				cookies.get(sessionCookie) ?? '',
				String(form.get('id') ?? '')
			);
		} catch (error) {
			return formError(error, 'members');
		}
		if (!locals.housebook.auth.validateSession(cookies.get(sessionCookie) ?? '')) {
			cookies.delete(sessionCookie, { path: '/', secure: url.protocol === 'https:' });
			redirect(303, '/sign-in');
		}
		return { section: 'members', removed: true };
	},
	createInvite: (event) => {
		const { member } = requireSession(event);
		return {
			invite: event.locals.housebook.invites.create(
				member.id,
				event.url.origin,
				process.env.HOUSEBOOK_URL
			)
		};
	},
	revokeInvite: async (event) => {
		const { locals, request } = event;
		const form = await request.formData();
		requireSession(event);
		locals.housebook.invites.revoke(String(form.get('id') ?? ''));
		return { revoked: true };
	},
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
