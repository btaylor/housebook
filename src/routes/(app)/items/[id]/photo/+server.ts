import { error } from '@sveltejs/kit';
import { DomainError } from '../../../../../lib/server/core';
import { fileResponse } from '../../../../../lib/server/file-response';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params }) => {
	try {
		return fileResponse(locals.housebook.items.openPhoto(params.id));
	} catch (cause) {
		if (cause instanceof DomainError) error(404, cause.message);
		throw cause;
	}
};
