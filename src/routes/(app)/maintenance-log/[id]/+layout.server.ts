import { error } from '@sveltejs/kit';
import { DomainError } from '../../../../lib/server/core';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, params }) => {
	try {
		return { record: locals.housebook.serviceRecords.get(params.id) };
	} catch (cause) {
		if (cause instanceof DomainError && cause.code === 'service-record-not-found') {
			error(404, cause.message);
		}
		throw cause;
	}
};
