import { error } from '@sveltejs/kit';
import { DomainError } from '../../../../../lib/server/core';
import { fileResponse } from '../../../../../lib/server/file-response';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params, url }) => {
	try {
		return fileResponse(
			locals.housebook.documents.open(params.id),
			url.searchParams.get('download') === '1'
		);
	} catch (cause) {
		if (cause instanceof DomainError) error(404, cause.message);
		throw cause;
	}
};
