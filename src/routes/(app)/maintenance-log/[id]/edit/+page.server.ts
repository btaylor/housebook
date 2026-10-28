import { error, fail, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../../../lib/server/core';
import { serviceRecordFormValues } from '../../../../../lib/server/service-record-form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => ({
	options: locals.housebook.serviceRecordOptions(params.id)
});

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		const values = serviceRecordFormValues(await request.formData());
		try {
			locals.housebook.serviceRecords.update(params.id, values);
		} catch (cause) {
			if (cause instanceof DomainError) {
				if (cause.code === 'service-record-not-found') error(404, cause.message);
				return fail(400, { message: cause.message, values });
			}
			throw cause;
		}
		redirect(303, `/maintenance-log/${params.id}`);
	}
};
