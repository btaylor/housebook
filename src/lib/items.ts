export const itemCategories = [
	'appliance',
	'HVAC',
	'plumbing',
	'electrical',
	'roof/exterior',
	'yard',
	'other'
] as const;

export interface ItemInput {
	name: string;
	category: string;
	location?: string | null;
	make?: string | null;
	model?: string | null;
	serialNumber?: string | null;
	installDate?: string | null;
	warrantyEndDate?: string | null;
	notes?: string | null;
}
