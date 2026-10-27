import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, count, desc, eq, gt, lte, ne, sql } from 'drizzle-orm';
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { houses, members, sessions, signInAttempts } from '../schema';
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
	| 'sign-in-locked'
	| 'session-required'
	| 'email-in-use'
	| 'incorrect-current-password';

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
	userAgent?: string;
}

const sessionLifetime = 30 * 24 * 60 * 60 * 1000;
const signInWindow = 15 * 60 * 1000;
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const memberFields = { id: members.id, name: members.name, email: members.email };
function validatePassword(password: string) {
	if ([...password].length < 12) {
		throw new DomainError('password-too-short', 'Use a password with at least 12 characters.');
	}
}

function normalizeProfile(name: string, email: string) {
	name = name.trim();
	email = email.trim().toLowerCase();
	if (!name) throw new DomainError('invalid-member-name', 'Enter your name.');
	if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
		throw new DomainError('invalid-email', 'Enter a valid email address.');
	}
	return { name, email };
}

function houseName(name: string) {
	name = name.trim();
	if (!name) throw new DomainError('invalid-house-name', 'Enter a House name.');
	return name;
}

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

	renameHouse(token: string, name: string) {
		this.auth.requireSession(token);
		this.database
			.update(houses)
			.set({ name: houseName(name) })
			.where(eq(houses.id, 1))
			.run();
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
		const name = houseName(input.houseName);
		const profile = normalizeProfile(input.memberName, input.email);
		const currency = input.currency.trim().toUpperCase();
		if (!currencies.includes(currency)) {
			throw new DomainError('invalid-currency', 'Choose a currency from the list.');
		}
		validatePassword(input.password);
		const passwordHash = await hashPassword(input.password);
		const session = this.database.transaction(() => {
			this.checkCode(input.code);
			const now = this.clock();
			const member = { id: randomUUID(), ...profile };
			this.database.insert(houses).values({ name, currency, createdAt: now }).run();
			this.database
				.insert(members)
				.values({ ...member, passwordHash, createdAt: now })
				.run();
			return createSession(this.database, this.clock, member, input.userAgent);
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

	async signIn(email: string, password: string, userAgent?: string): Promise<Session> {
		const member = this.database
			.select()
			.from(members)
			.where(eq(sql`lower(${members.email})`, email.trim().toLowerCase()))
			.get();
		this.checkLock(member?.signInLockedUntil);
		const correct = await verifyPassword(password, member?.passwordHash);
		if (!member) {
			throw new DomainError('invalid-credentials', 'Email or password is incorrect.');
		}
		const result = this.database.transaction(() => {
			const current = this.database.select().from(members).where(eq(members.id, member.id)).get();
			this.checkLock(current?.signInLockedUntil);
			if (!current) {
				return new DomainError('invalid-credentials', 'Email or password is incorrect.');
			}
			const now = this.clock();
			this.database
				.delete(signInAttempts)
				.where(
					and(
						eq(signInAttempts.memberId, member.id),
						lte(signInAttempts.attemptedAt, new Date(now.getTime() - signInWindow))
					)
				)
				.run();
			if (
				!correct ||
				current.passwordHash !== member.passwordHash ||
				current.email !== member.email
			) {
				this.database
					.insert(signInAttempts)
					.values({ memberId: member.id, attemptedAt: now })
					.run();
				const failures = this.database
					.select({ total: count() })
					.from(signInAttempts)
					.where(eq(signInAttempts.memberId, member.id))
					.get()!.total;
				if (failures >= 5) {
					this.database
						.update(members)
						.set({ signInLockedUntil: new Date(now.getTime() + signInWindow) })
						.where(eq(members.id, member.id))
						.run();
					return this.lockedError();
				}
				return new DomainError('invalid-credentials', 'Email or password is incorrect.');
			}
			return createSession(
				this.database,
				this.clock,
				{ id: current.id, name: current.name, email: current.email },
				userAgent
			);
		});
		// Returning errors lets the transaction commit failed attempts before they are reported.
		if (result instanceof DomainError) throw result;
		return result;
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

	requireSession(token: string) {
		const session = this.validateSession(token);
		if (!session) throw new DomainError('session-required', 'Sign in to continue.');
		return session;
	}

	updateProfile(token: string, input: { name: string; email: string }): Member {
		const { member } = this.requireSession(token);
		const profile = normalizeProfile(input.name, input.email);
		return this.database.transaction(() => {
			const duplicate = this.database
				.select({ id: members.id })
				.from(members)
				.where(and(eq(sql`lower(${members.email})`, profile.email), ne(members.id, member.id)))
				.get();
			if (duplicate)
				throw new DomainError('email-in-use', 'Another Member uses that email address.');
			this.database.update(members).set(profile).where(eq(members.id, member.id)).run();
			return { id: member.id, ...profile };
		});
	}

	async changePassword(token: string, currentPassword: string, newPassword: string) {
		const { member } = this.requireSession(token);
		const current = this.database.select().from(members).where(eq(members.id, member.id)).get()!;
		if (!(await verifyPassword(currentPassword, current.passwordHash))) {
			throw new DomainError('incorrect-current-password', 'Current password is incorrect.');
		}
		validatePassword(newPassword);
		const passwordHash = await hashPassword(newPassword);
		this.database.transaction(() => {
			this.requireSession(token);
			const updated = this.database
				.update(members)
				.set({ passwordHash })
				.where(and(eq(members.id, member.id), eq(members.passwordHash, current.passwordHash)))
				.run();
			if (!updated.changes) {
				throw new DomainError(
					'incorrect-current-password',
					'Current password has changed. Try again.'
				);
			}
		});
	}

	listSessions(token: string) {
		const { member } = this.requireSession(token);
		const currentHash = tokenHash(token);
		return this.database
			.select({
				tokenHash: sessions.tokenHash,
				deviceHint: sessions.deviceHint,
				lastSeenAt: sessions.lastSeenAt
			})
			.from(sessions)
			.where(and(eq(sessions.memberId, member.id), gt(sessions.expiresAt, this.clock())))
			.orderBy(desc(sessions.lastSeenAt), desc(sessions.createdAt), sessions.tokenHash)
			.all()
			.map(({ tokenHash: hash, ...summary }) => ({ ...summary, current: hash === currentHash }));
	}

	signOutAll(token: string) {
		const { member } = this.requireSession(token);
		this.database.delete(sessions).where(eq(sessions.memberId, member.id)).run();
	}

	private checkLock(until: Date | null | undefined) {
		if (until && until.getTime() > this.clock().getTime()) throw this.lockedError();
	}

	private lockedError() {
		return new DomainError('sign-in-locked', 'Too many failed sign-ins. Try again in 15 minutes.');
	}
}

function deviceHint(userAgent = '') {
	const agent = userAgent.slice(0, 1024);
	const browsers: [RegExp, string][] = [
		[/Edg(e|A|iOS)?\//, 'Edge'],
		[/Firefox\/|FxiOS\//, 'Firefox'],
		[/Chrome\/|CriOS\//, 'Chrome'],
		[/Safari\//, 'Safari']
	];
	const devices: [RegExp, string][] = [
		[/iPad/, 'iPad'],
		[/iPhone/, 'iPhone'],
		[/Android/, 'Android'],
		[/Windows/, 'Windows'],
		[/Macintosh/, 'Mac'],
		[/Linux/, 'Linux']
	];
	const browser = browsers.find(([pattern]) => pattern.test(agent))?.[1] ?? 'Unknown browser';
	const device = devices.find(([pattern]) => pattern.test(agent))?.[1] ?? 'Unknown device';
	return `${browser} · ${device}`;
}

function createSession(
	database: NodeSQLiteDatabase,
	clock: () => Date,
	member: Member,
	userAgent?: string
): Session {
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
			expiresAt,
			deviceHint: deviceHint(userAgent)
		})
		.run();
	return { token, expiresAt, member };
}
