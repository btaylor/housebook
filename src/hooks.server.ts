import { building } from '$app/env';
import { redirect } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { openHousebook } from './lib/server/database';
import { sessionCookie, setSessionCookie } from './lib/server/session-cookie';

let housebook: Awaited<ReturnType<typeof openHousebook>> | undefined;

export const init: ServerInit = async () => {
	if (building) return;
	const resetting = process.argv[2] === 'reset-password';
	const args = process.argv.slice(3);
	if (resetting && (args.length !== 1 || !args[0])) {
		throw new Error('Usage: node server.js reset-password <member-email>');
	}
	const runtime = await openHousebook({
		dataDirectory: process.env.HOUSEBOOK_DATA_DIR ?? '.data'
	});
	if (resetting) {
		try {
			const reset = runtime.core.auth.createPasswordResetForEmail(
				args[0],
				'http://localhost:3000',
				process.env.HOUSEBOOK_URL
			);
			console.info(reset.url);
		} finally {
			runtime.close();
		}
		return;
	}
	housebook = runtime;
	const code = housebook.core.setup.issueCode();
	if (code) console.info(`Housebook setup code: ${code}`);
	process.once('exit', () => housebook?.close());
};

export const handle: Handle = async ({ event, resolve }) => {
	if (!housebook) throw new Error('Housebook has not finished starting.');
	event.locals.housebook = housebook.core;
	event.locals.member = null;
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const path = event.url.pathname;
	if (!housebook.core.setup.getHouse()) {
		if (path !== '/setup') redirect(303, '/setup');
		return resolve(event);
	}

	const token = event.cookies.get(sessionCookie);
	const session = token ? housebook.core.auth.validateSession(token) : null;
	if (session) {
		event.locals.member = session.member;
		setSessionCookie(event, session);
	} else if (token) {
		event.cookies.delete(sessionCookie, { path: '/', secure: event.url.protocol === 'https:' });
	}
	if (path === '/setup') redirect(303, session ? '/items' : '/sign-in');
	if (!session && path !== '/sign-in' && !/^\/(?:invite|reset-password)\/[^/]+$/.test(path)) {
		redirect(303, '/sign-in');
	}
	if (session && path === '/sign-in') redirect(303, '/items');
	return resolve(event);
};
