import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { houses, members, sessions } from '../schema';
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
	| 'invalid-credentials';

export class DomainError extends Error {
	constructor(
		readonly code: DomainErrorCode,
		message: string
	) {
		super(message);
		this.name = 'DomainError';
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
	constructor(
		readonly database: NodeSQLiteDatabase,
		readonly dataDirectory: string,
		readonly clock: () => Date
	) {
		this.auth = new Auth(database, clock);
		this.setup = new Setup(database, clock);
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
