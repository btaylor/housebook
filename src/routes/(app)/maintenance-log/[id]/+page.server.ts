import { error, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../../lib/server/core';
import { requireSession } from '../../../../lib/server/session-cookie';
import type { Actions } from './$types';

export const actions: Actions = {
	delete: (event) => {
		const { locals, params } = event;
		requireSession(event);
		try {
			locals.housebook.serviceRecords.delete(params.id);
		} catch (cause) {
			if (cause instanceof DomainError && cause.code === 'service-record-not-found') {
				error(404, cause.message);
			}
			throw cause;
		}
		redirect(303, '/maintenance-log');
	}
};
