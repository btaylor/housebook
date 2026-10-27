import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	house: locals.housebook.setup.getHouse()!,
	member: locals.member!
});
