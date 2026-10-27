import { building } from '$app/env';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { openHousebook } from './lib/server/database';

let housebook: Awaited<ReturnType<typeof openHousebook>> | undefined;

export const init: ServerInit = async () => {
	if (building) return;
	housebook = await openHousebook({
		dataDirectory: process.env.HOUSEBOOK_DATA_DIR ?? '.data'
	});
	process.on('sveltekit:shutdown', () => housebook?.close());
};

export const handle: Handle = async ({ event, resolve }) => {
	if (!housebook) throw new Error('Housebook has not finished starting.');
	event.locals.housebook = housebook.core;
	return resolve(event);
};
