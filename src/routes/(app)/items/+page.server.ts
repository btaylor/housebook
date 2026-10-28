import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const search = url.searchParams.get('search') ?? '';
	const category = url.searchParams.get('category') ?? '';
	const includeRetired = url.searchParams.get('retired') === '1';
	return {
		items: locals.housebook.items.list({ search, category, includeRetired }),
		search,
		category,
		includeRetired
	};
};
