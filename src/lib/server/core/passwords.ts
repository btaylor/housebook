import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

function derive(password: string, salt: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(
			password,
			salt,
			64,
			{ N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 },
			(error, key) => {
				if (error) reject(error);
				else resolve(key);
			}
		);
	});
}

export async function hashPassword(password: string) {
	const salt = randomBytes(16).toString('hex');
	const key = await derive(password, salt);
	return `scrypt:65536:8:1:${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string | undefined) {
	const [, , , , salt, encoded] = hash?.split(':') ?? [];
	// Unknown emails still perform the same expensive password derivation.
	const key = await derive(password, salt ?? 'housebook-unknown-member');
	return encoded !== undefined && timingSafeEqual(key, Buffer.from(encoded, 'hex'));
}
