import { error, fail, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../../lib/server/core';
import { requireSession } from '../../../../lib/server/session-cookie';
import type { Actions } from './$types';

export const actions: Actions = {
	document: async (event) => {
		const { locals, params, request } = event;
		const form = await request.formData();
		const title = String(form.get('title') ?? '');
		requireSession(event);
		try {
			const upload = form.get('document');
			await locals.housebook.documents.addToServiceRecord(
				params.id,
				title,
				upload instanceof File ? upload : new File([], ''),
				() => requireSession(event)
			);
			return { message: 'Document attached.' };
		} catch (cause) {
			if (cause instanceof DomainError) return fail(400, { error: cause.message, title });
			throw cause;
		}
	},
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
