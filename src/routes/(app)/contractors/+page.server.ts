import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const includeArchived = url.searchParams.get('archived') === '1';
	return {
		contractors: locals.housebook.contractors.list({ includeArchived }),
		includeArchived
	};
};
