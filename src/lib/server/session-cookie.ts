import { redirect, type RequestEvent } from '@sveltejs/kit';
import { DomainError, type Session } from './core';

export const sessionCookie = 'housebook_session';

export function requireSession(event: RequestEvent) {
	try {
		return event.locals.housebook.auth.requireSession(event.cookies.get(sessionCookie) ?? '');
	} catch (error) {
		if (error instanceof DomainError && error.code === 'session-required') {
			event.cookies.delete(sessionCookie, { path: '/', secure: event.url.protocol === 'https:' });
			redirect(303, '/sign-in');
		}
		throw error;
	}
}

export function setSessionCookie(event: RequestEvent, session: Session) {
	event.cookies.set(sessionCookie, session.token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:',
		expires: session.expiresAt
	});
}
