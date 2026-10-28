import { error, fail, redirect } from '@sveltejs/kit';
import { DomainError } from '../../../../lib/server/core';
import { serviceRecordFormValues } from '../../../../lib/server/service-record-form';
import { requireSession } from '../../../../lib/server/session-cookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const itemId = url.searchParams.get('item');
	if (itemId && !locals.housebook.items.get(itemId)) error(404, 'Item not found.');
	return {
		options: locals.housebook.serviceRecordOptions(),
		values: {
			date: locals.housebook.clock().toISOString().slice(0, 10),
			notes: '',
			itemIds: itemId ? [itemId] : []
		}
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { locals, request } = event;
		const values = serviceRecordFormValues(await request.formData());
		requireSession(event);
		let record;
		try {
			record = locals.housebook.serviceRecords.create(values);
		} catch (cause) {
			if (cause instanceof DomainError) return fail(400, { message: cause.message, values });
			throw cause;
		}
		redirect(303, `/maintenance-log/${record.id}`);
	}
};
