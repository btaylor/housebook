import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { eq, isNull, sql } from 'drizzle-orm';
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { contractors, houses, members, sessions } from '../schema';
import { currencies } from './currencies';
import { hashPassword, verifyPassword } from './passwords';

export { currencies } from './currencies';

export type DomainErrorCode =
	| 'setup-complete'
	| 'invalid-setup-code'
	| 'invalid-house-name'
	| 'invalid-currency'
	| 'invalid-member-name'
	| 'invalid-email'
	| 'password-too-short'
	| 'invalid-credentials'
	| 'invalid-contractor-name'
	| 'invalid-contractor-phone'
	| 'invalid-contractor-email'
	| 'contractor-not-found';

export class DomainError extends Error {
	constructor(
		readonly code: DomainErrorCode,
		message: string
	) {
		super(message);
		this.name = 'DomainError';
	}
}

class Contractors {
	constructor(
		private database: NodeSQLiteDatabase,
		private clock: () => Date
	) {}

	create(input: ContractorInput) {
		return this.database
			.insert(contractors)
			.values({ id: randomUUID(), ...this.validate(input) })
			.returning()
			.get();
	}

	update(id: string, input: ContractorInput) {
		this.get(id);
		return this.database
			.update(contractors)
			.set(this.validate(input))
			.where(eq(contractors.id, id))
			.returning()
			.get()!;
	}

	get(id: string) {
		const contractor = this.database.select().from(contractors).where(eq(contractors.id, id)).get();
		if (!contractor) {
			throw new DomainError('contractor-not-found', 'Contractor not found.');
		}
		return contractor;
	}

	list({ includeArchived = false } = {}) {
		return this.database
			.select()
			.from(contractors)
			.where(includeArchived ? undefined : isNull(contractors.archivedAt))
			.orderBy(sql`${contractors.name} COLLATE NOCASE`, contractors.id)
			.all();
	}

	listActive() {
		return this.list();
	}

	archive(id: string) {
		const contractor = this.get(id);
		return this.database
			.update(contractors)
			.set({ archivedAt: contractor.archivedAt ?? this.clock() })
			.where(eq(contractors.id, id))
			.returning()
			.get()!;
	}

	unarchive(id: string) {
		this.get(id);
		return this.database
			.update(contractors)
			.set({ archivedAt: null })
			.where(eq(contractors.id, id))
			.returning()
			.get()!;
	}

	private validate(input: ContractorInput) {
		const name = input.name.trim();
		if (!name) throw new DomainError('invalid-contractor-name', 'Enter a Contractor name.');
		const rawPhone = input.phone?.trim() ?? '';
		const digits = rawPhone.replace(/\D/g, '');
		if (rawPhone && !digits) {
			throw new DomainError(
				'invalid-contractor-phone',
				'Enter a phone number with at least one digit.'
			);
		}
		const phone = (rawPhone.startsWith('+') ? '+' : '') + digits;
		const email = input.email?.trim().toLowerCase() ?? '';
		const at = email.indexOf('@');
		if (email && (at < 0 || email.indexOf('.', at + 1) < 0)) {
			throw new DomainError(
				'invalid-contractor-email',
				'Enter an email address with an @ followed by a period.'
			);
		}
		return {
			name,
			phone,
			email,
			trade: input.trade?.trim() ?? '',
			notes: input.notes?.trim() ?? ''
		};
	}
}

export interface Member {
	id: string;
	name: string;
	email: string;
}

export interface Session {
	token: string;
	expiresAt: Date;
	member: Member;
}

export interface ContractorInput {
	name: string;
	phone?: string;
	email?: string;
	trade?: string;
	notes?: string;
}

interface SetupInput {
	code: string;
	houseName: string;
	currency: string;
	memberName: string;
	email: string;
	password: string;
}

const sessionLifetime = 30 * 24 * 60 * 60 * 1000;
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const memberFields = { id: members.id, name: members.name, email: members.email };

export class Housebook {
	readonly setup: Setup;
	readonly auth: Auth;
	readonly contractors: Contractors;
	constructor(
		readonly database: NodeSQLiteDatabase,
		readonly dataDirectory: string,
		readonly clock: () => Date
	) {
		this.auth = new Auth(database, clock);
		this.setup = new Setup(database, clock);
		this.contractors = new Contractors(database, clock);
	}
}

class Setup {
	#code: string | undefined;

	constructor(
		private database: NodeSQLiteDatabase,
		private clock: () => Date
	) {}

	getHouse() {
		return this.database.select().from(houses).get() ?? null;
	}

	issueCode() {
		if (this.getHouse()) {
			this.#code = undefined;
			return null;
		}
		return (this.#code ??= randomBytes(24).toString('base64url'));
	}

	async complete(input: SetupInput): Promise<Session> {
		this.checkCode(input.code);
		const name = input.houseName.trim();
		const memberName = input.memberName.trim();
		const currency = input.currency.trim().toUpperCase();
		const email = input.email.trim().toLowerCase();
		if (!name) throw new DomainError('invalid-house-name', 'Enter a House name.');
		if (!currencies.includes(currency)) {
			throw new DomainError('invalid-currency', 'Choose a currency from the list.');
		}
		if (!memberName) throw new DomainError('invalid-member-name', 'Enter your name.');
		if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
			throw new DomainError('invalid-email', 'Enter a valid email address.');
		}
		if ([...input.password].length < 12) {
			throw new DomainError('password-too-short', 'Use a password with at least 12 characters.');
		}
		const passwordHash = await hashPassword(input.password);
		const session = this.database.transaction(() => {
			this.checkCode(input.code);
			const now = this.clock();
			const member = { id: randomUUID(), name: memberName, email };
			this.database.insert(houses).values({ name, currency, createdAt: now }).run();
			this.database
				.insert(members)
				.values({ ...member, passwordHash, createdAt: now })
				.run();
			return createSession(this.database, this.clock, member);
		});
		this.#code = undefined;
		return session;
	}

	private checkCode(code: string) {
		if (this.getHouse()) {
			throw new DomainError('setup-complete', 'This Housebook is already set up.');
		}
		if (
			!this.#code ||
			!timingSafeEqual(Buffer.from(tokenHash(code)), Buffer.from(tokenHash(this.#code)))
		) {
			throw new DomainError('invalid-setup-code', 'Enter the setup code from the server logs.');
		}
	}
}

class Auth {
	constructor(
		private database: NodeSQLiteDatabase,
		private clock: () => Date
	) {}

	async signIn(email: string, password: string): Promise<Session> {
		const member = this.database
			.select()
			.from(members)
			.where(eq(members.email, email.trim().toLowerCase()))
			.get();
		if (!(await verifyPassword(password, member?.passwordHash)) || !member) {
			throw new DomainError('invalid-credentials', 'Email or password is incorrect.');
		}
		return createSession(this.database, this.clock, {
			id: member.id,
			name: member.name,
			email: member.email
		});
	}

	validateSession(token: string): Session | null {
		const hash = tokenHash(token);
		const row = this.database
			.select({ member: memberFields, expiresAt: sessions.expiresAt })
			.from(sessions)
			.innerJoin(members, eq(members.id, sessions.memberId))
			.where(eq(sessions.tokenHash, hash))
			.get();
		if (!row) return null;
		const now = this.clock();
		if (row.expiresAt.getTime() <= now.getTime()) {
			this.database.delete(sessions).where(eq(sessions.tokenHash, hash)).run();
			return null;
		}
		const expiresAt = new Date(now.getTime() + sessionLifetime);
		this.database
			.update(sessions)
			.set({ lastSeenAt: now, expiresAt })
			.where(eq(sessions.tokenHash, hash))
			.run();
		return { token, expiresAt, member: row.member };
	}

	signOut(token: string) {
		this.database
			.delete(sessions)
			.where(eq(sessions.tokenHash, tokenHash(token)))
			.run();
	}
}

function createSession(database: NodeSQLiteDatabase, clock: () => Date, member: Member): Session {
	const token = randomBytes(32).toString('base64url');
	const now = clock();
	const expiresAt = new Date(now.getTime() + sessionLifetime);
	database
		.insert(sessions)
		.values({
			tokenHash: tokenHash(token),
			memberId: member.id,
			createdAt: now,
			lastSeenAt: now,
			expiresAt
		})
		.run();
	return { token, expiresAt, member };
}
