import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, asc, count, desc, DrizzleQueryError, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import {
	contractors,
	houses,
	invites,
	members,
	passwordResets,
	sessions,
	signInAttempts
} from '../schema';
import { currencies } from './currencies';
import { DomainError } from './errors';
import { Documents } from './documents';
import { Files } from './files';
import { Items } from './items';
import { hashPassword, verifyPassword } from './passwords';
import { ServiceRecords } from './service-records';
import { createTokenLink, tokenHash } from './tokens';

export { currencies } from './currencies';

export { DomainError, type DomainErrorCode } from './errors';

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

interface MemberInput {
	memberName: string;
	email: string;
	password: string;
	userAgent?: string;
}

interface SetupInput extends MemberInput {
	code: string;
	houseName: string;
	currency: string;
}

const sessionLifetime = 30 * 24 * 60 * 60 * 1000;
const inviteLifetime = 7 * 24 * 60 * 60 * 1000;
const resetLifetime = 24 * 60 * 60 * 1000;
const signInWindow = 15 * 60 * 1000;
const sqliteConstraintUnique = 2067;
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
	readonly members: HouseholdMembers;
	readonly invites: Invites;
	readonly contractors: Contractors;
	readonly items: Items;
	readonly serviceRecords: ServiceRecords;
	readonly documents: Documents;
	constructor(
		readonly database: NodeSQLiteDatabase,
		readonly dataDirectory: string,
		readonly clock: () => Date
	) {
		this.auth = new Auth(database, clock);
		this.setup = new Setup(database, clock);
		this.members = new HouseholdMembers(database, clock, this.auth);
		this.invites = new Invites(database, clock);
		this.contractors = new Contractors(database, clock);
		const files = new Files(database, dataDirectory);
		this.items = new Items(database, clock, files);
		this.documents = new Documents(database, files);
		this.serviceRecords = new ServiceRecords(database);
	}
	serviceRecordOptions(id?: string) {
		const record = id ? this.serviceRecords.get(id) : null;
		const activeContractors = this.contractors.listActive();
		const activeMembers = this.members.list();
		return {
			contractors: record?.contractor?.archivedAt
				? [...activeContractors, record.contractor]
				: activeContractors,
			members:
				record?.member && !activeMembers.some((member) => member.id === record.member!.id)
					? [...activeMembers, record.member]
					: activeMembers,
			items: this.items.list({ includeRetired: true })
		};
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

class HouseholdMembers {
	constructor(
		private database: NodeSQLiteDatabase,
		private clock: () => Date,
		private auth: Auth
	) {}

	list(): Member[] {
		return this.database
			.select(memberFields)
			.from(members)
			.where(isNull(members.removedAt))
			.orderBy(asc(members.createdAt), asc(members.id))
			.all();
	}

	remove(token: string, id: string) {
		this.database.transaction(() => {
			this.auth.requireSession(token);
			const member = this.database
				.select({ id: members.id })
				.from(members)
				.where(and(eq(members.id, id), isNull(members.removedAt)))
				.get();
			if (!member) throw new DomainError('member-not-found', 'Member not found.');
			const remaining = this.database
				.select({ total: count() })
				.from(members)
				.where(isNull(members.removedAt))
				.get()!.total;
			if (remaining <= 1) {
				throw new DomainError('last-member', 'The last Member cannot be removed.');
			}
			const now = this.clock();
			this.database.update(members).set({ removedAt: now }).where(eq(members.id, id)).run();
			this.database.delete(sessions).where(eq(sessions.memberId, id)).run();
			this.database
				.update(invites)
				.set({ revokedAt: now })
				.where(and(eq(invites.createdBy, id), isNull(invites.usedAt), isNull(invites.revokedAt)))
				.run();
		});
	}
}

class Invites {
	constructor(
		private database: NodeSQLiteDatabase,
		private clock: () => Date
	) {}

	create(memberId: string, requestOrigin: string, housebookUrl?: string) {
		if (
			!this.database
				.select({ id: members.id })
				.from(members)
				.where(and(eq(members.id, memberId), isNull(members.removedAt)))
				.get()
		) {
			throw new DomainError('member-not-found', 'Member not found.');
		}
		const { tokenHash, url } = createTokenLink('/invite', requestOrigin, housebookUrl);
		const now = this.clock();
		const invite = {
			id: randomUUID(),
			createdBy: memberId,
			createdAt: now,
			expiresAt: new Date(now.getTime() + inviteLifetime)
		};
		this.database
			.insert(invites)
			.values({ ...invite, tokenHash })
			.run();
		return { ...invite, url };
	}

	list() {
		return this.database
			.select({
				id: invites.id,
				createdBy: invites.createdBy,
				createdAt: invites.createdAt,
				expiresAt: invites.expiresAt
			})
			.from(invites)
			.where(this.unused())
			.orderBy(asc(invites.createdAt), asc(invites.id))
			.all();
	}

	revoke(id: string) {
		this.database.update(invites).set({ revokedAt: this.clock() }).where(eq(invites.id, id)).run();
	}

	isValid(token: string) {
		return this.find(token) !== undefined;
	}

	async redeem(token: string, input: MemberInput): Promise<Session> {
		this.requireInvite(token);
		const details = normalizeProfile(input.memberName, input.email);
		validatePassword(input.password);
		this.checkEmail(details.email);
		const passwordHash = await hashPassword(input.password);
		return this.database.transaction(() => {
			const invite = this.requireInvite(token);
			this.checkEmail(details.email);
			const now = this.clock();
			const member = { id: randomUUID(), ...details };
			this.database
				.insert(members)
				.values({ ...member, passwordHash, createdAt: now })
				.run();
			this.database.update(invites).set({ usedAt: now }).where(eq(invites.id, invite.id)).run();
			return createSession(this.database, this.clock, member, input.userAgent);
		});
	}

	private unused() {
		return and(
			isNull(invites.usedAt),
			isNull(invites.revokedAt),
			gt(invites.expiresAt, this.clock())
		);
	}

	private find(token: string) {
		return this.database
			.select({ id: invites.id })
			.from(invites)
			.where(and(eq(invites.tokenHash, tokenHash(token)), this.unused()))
			.get();
	}

	private requireInvite(token: string) {
		const invite = this.find(token);
		if (!invite)
			throw new DomainError(
				'invalid-invite',
				'This Invite is invalid, expired, or no longer available. Ask a Member for a new Invite.'
			);
		return invite;
	}

	private checkEmail(email: string) {
		if (
			this.database
				.select({ id: members.id })
				.from(members)
				.where(and(sql`lower(${members.email}) = ${email}`, isNull(members.removedAt)))
				.get()
		) {
			throw new DomainError('email-in-use', 'A Member already uses this email address.');
		}
	}
}

class Auth {
	constructor(
		private database: NodeSQLiteDatabase,
		private clock: () => Date
	) {}
	createPasswordReset(
		sessionToken: string,
		memberId: string,
		requestOrigin: string,
		housebookUrl?: string
	) {
		const { member } = this.requireSession(sessionToken);
		if (member.id === memberId) {
			throw new DomainError(
				'cannot-reset-self',
				'Ask another Member for a reset link, or use the installer command.'
			);
		}
		return this.issuePasswordReset(memberId, requestOrigin, housebookUrl, member.id);
	}

	createPasswordResetForEmail(email: string, requestOrigin: string, housebookUrl?: string) {
		const member = this.database
			.select({ id: members.id })
			.from(members)
			.where(
				and(eq(sql`lower(${members.email})`, email.trim().toLowerCase()), isNull(members.removedAt))
			)
			.get();
		if (!member) throw new DomainError('member-not-found', 'No Member uses that email address.');
		return this.issuePasswordReset(member.id, requestOrigin, housebookUrl);
	}

	isPasswordResetValid(token: string) {
		return this.findPasswordReset(token) !== undefined;
	}

	async resetPassword(token: string, password: string) {
		this.requirePasswordReset(token);
		validatePassword(password);
		const passwordHash = await hashPassword(password);
		this.database.transaction(() => {
			const reset = this.requirePasswordReset(token);
			this.database
				.update(members)
				.set({ passwordHash, signInLockedUntil: null })
				.where(eq(members.id, reset.memberId))
				.run();
			this.database.delete(signInAttempts).where(eq(signInAttempts.memberId, reset.memberId)).run();
			this.database.delete(sessions).where(eq(sessions.memberId, reset.memberId)).run();
			this.database
				.update(passwordResets)
				.set({ usedAt: this.clock() })
				.where(eq(passwordResets.id, reset.id))
				.run();
		});
	}

	private issuePasswordReset(
		memberId: string,
		requestOrigin: string,
		housebookUrl?: string,
		createdBy?: string
	) {
		const member = this.database
			.select(memberFields)
			.from(members)
			.where(and(eq(members.id, memberId), isNull(members.removedAt)))
			.get();
		if (!member) throw new DomainError('member-not-found', 'Member not found.');
		const { tokenHash, url } = createTokenLink('/reset-password', requestOrigin, housebookUrl);
		const now = this.clock();
		const reset = {
			id: randomUUID(),
			memberId,
			createdBy,
			createdAt: now,
			expiresAt: new Date(now.getTime() + resetLifetime)
		};
		this.database
			.insert(passwordResets)
			.values({ ...reset, tokenHash })
			.run();
		return { ...reset, memberName: member.name, url };
	}

	private findPasswordReset(token: string) {
		return this.database
			.select({ id: passwordResets.id, memberId: passwordResets.memberId })
			.from(passwordResets)
			.innerJoin(members, eq(members.id, passwordResets.memberId))
			.where(
				and(
					eq(passwordResets.tokenHash, tokenHash(token)),
					isNull(members.removedAt),
					isNull(passwordResets.usedAt),
					gt(passwordResets.expiresAt, this.clock())
				)
			)
			.get();
	}

	private requirePasswordReset(token: string) {
		const reset = this.findPasswordReset(token);
		if (!reset) {
			throw new DomainError(
				'invalid-password-reset',
				'This reset link is invalid, expired, or already used. Ask a Member or the installer for a new link.'
			);
		}
		return reset;
	}

	async signIn(email: string, password: string, userAgent?: string): Promise<Session> {
		const member = this.database
			.select()
			.from(members)
			.where(
				and(eq(sql`lower(${members.email})`, email.trim().toLowerCase()), isNull(members.removedAt))
			)
			.get();
		this.checkLock(member?.signInLockedUntil);
		const correct = await verifyPassword(password, member?.passwordHash);
		if (!member) {
			throw new DomainError('invalid-credentials', 'Email or password is incorrect.');
		}
		const result = this.database.transaction(() => {
			const current = this.database
				.select()
				.from(members)
				.where(and(eq(members.id, member.id), isNull(members.removedAt)))
				.get();
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
			.where(and(eq(sessions.tokenHash, hash), isNull(members.removedAt)))
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
		try {
			this.database.update(members).set(profile).where(eq(members.id, member.id)).run();
		} catch (error) {
			const cause = error instanceof DrizzleQueryError ? error.cause : error;
			if (
				cause instanceof Error &&
				'errcode' in cause &&
				cause.errcode === sqliteConstraintUnique &&
				cause.message === "UNIQUE constraint failed: index 'active_members_email_unique'"
			) {
				throw new DomainError('email-in-use', 'Another Member uses that email address.');
			}
			throw error;
		}
		return { id: member.id, ...profile };
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
