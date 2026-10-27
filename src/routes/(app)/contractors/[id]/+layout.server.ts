import { error } from '@sveltejs/kit';
import { DomainError } from '../../../../lib/server/core';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, params }) => {
	try {
		return { contractor: locals.housebook.contractors.get(params.id) };
	} catch (cause) {
		if (cause instanceof DomainError && cause.code === 'contractor-not-found') {
			error(404, cause.message);
		}
		throw cause;
	}
};
