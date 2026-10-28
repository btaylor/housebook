export type DomainErrorCode =
	| 'setup-complete'
	| 'invalid-setup-code'
	| 'invalid-house-name'
	| 'invalid-currency'
	| 'invalid-member-name'
	| 'invalid-email'
	| 'password-too-short'
	| 'invalid-credentials'
	| 'sign-in-locked'
	| 'session-required'
	| 'email-in-use'
	| 'incorrect-current-password'
	| 'invalid-contractor-name'
	| 'invalid-contractor-phone'
	| 'invalid-contractor-email'
	| 'contractor-not-found'
	| 'invalid-item-name'
	| 'invalid-item-category'
	| 'invalid-item-date'
	| 'item-not-found';

export class DomainError extends Error {
	constructor(
		readonly code: DomainErrorCode,
		message: string
	) {
		super(message);
		this.name = 'DomainError';
	}
}
