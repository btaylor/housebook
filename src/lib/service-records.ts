export interface ServiceRecordInput {
	date: string;
	notes: string;
	cost?: string;
	contractorId?: string | null;
	memberId?: string | null;
	itemIds?: string[];
}

export function costInputValue(cents: number | null) {
	if (cents === null) return '';
	const digits = String(cents).padStart(3, '0');
	return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function formatCost(cents: number, currency: string) {
	return new Intl.NumberFormat('en', {
		style: 'currency',
		currency,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})
		.formatToParts(BigInt(cents) / 100n)
		.map((part) => (part.type === 'fraction' ? String(cents % 100).padStart(2, '0') : part.value))
		.join('');
}
