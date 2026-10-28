import { error, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../../lib/server/core';
import { requireSession } from '../../../../lib/server/session-cookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => ({
	records: locals.housebook.serviceRecords.list({ contractorId: params.id })
});

export const actions: Actions = {
	archive: (event) => {
		const { locals, params } = event;
		requireSession(event);
		try {
			locals.housebook.contractors.archive(params.id);
		} catch (cause) {
			if (cause instanceof DomainError) error(404, cause.message);
			throw cause;
		}
		redirect(303, '/contractors');
	},
	unarchive: (event) => {
		const { locals, params } = event;
		requireSession(event);
		try {
			locals.housebook.contractors.unarchive(params.id);
		} catch (cause) {
			if (cause instanceof DomainError) error(404, cause.message);
			throw cause;
		}
		redirect(303, `/contractors/${params.id}`);
	}
};
