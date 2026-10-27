import type { RequestEvent } from '@sveltejs/kit';
import type { Session } from './core';

export const sessionCookie = 'housebook_session';

export function setSessionCookie(event: RequestEvent, session: Session) {
	event.cookies.set(sessionCookie, session.token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:',
		expires: session.expiresAt
	});
}
