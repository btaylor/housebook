import type { ServiceRecordInput } from '../service-records';

export function serviceRecordFormValues(form: FormData): ServiceRecordInput {
	const performer = String(form.get('performer') ?? '');
	return {
		date: String(form.get('date') ?? ''),
		notes: String(form.get('notes') ?? ''),
		cost: String(form.get('cost') ?? ''),
		contractorId: performer.startsWith('contractor:') ? performer.slice(11) : null,
		memberId: performer.startsWith('member:') ? performer.slice(7) : null,
		itemIds: form.getAll('itemIds').map(String)
	};
}
