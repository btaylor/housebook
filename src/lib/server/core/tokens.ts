import { createHash, randomBytes } from 'node:crypto';

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createTokenLink(path: string, requestOrigin: string, housebookUrl?: string) {
	const token = randomBytes(32).toString('base64url');
	return {
		tokenHash: tokenHash(token),
		url: new URL(`${path}/${token}`, housebookUrl || requestOrigin).href
	};
}
