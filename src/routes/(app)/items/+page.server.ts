import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const search = url.searchParams.get('search') ?? '';
	const category = url.searchParams.get('category') ?? '';
	return { items: locals.housebook.items.list({ search, category }), search, category };
};
