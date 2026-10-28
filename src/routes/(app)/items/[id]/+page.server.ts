import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const item = locals.housebook.items.get(params.id);
	if (!item) error(404, 'Item not found.');
	return { item };
};
