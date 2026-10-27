import { redirect } from '@sveltejs/kit';
import { sessionCookie } from '../../../lib/server/session-cookie';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals, cookies, url }) => {
	const token = cookies.get(sessionCookie);
	if (token) locals.housebook.auth.signOut(token);
	cookies.delete(sessionCookie, { path: '/', secure: url.protocol === 'https:' });
	redirect(303, '/sign-in');
};
