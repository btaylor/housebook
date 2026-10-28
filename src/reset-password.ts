import { openHousebook } from './lib/server/database';

const [email, ...extra] = process.argv.slice(2);
let runtime: Awaited<ReturnType<typeof openHousebook>> | undefined;
try {
	if (!email || extra.length) throw new Error('Usage: reset-password <member-email>');
	runtime = await openHousebook({
		dataDirectory: process.env.HOUSEBOOK_DATA_DIR ?? '.data'
	});
	const reset = runtime.core.auth.createPasswordResetForEmail(
		email,
		'http://localhost:3000',
		process.env.HOUSEBOOK_URL
	);
	console.info(reset.url);
} catch (error) {
	console.error(error instanceof Error ? error.message : 'Could not create a password reset link.');
	process.exitCode = 1;
} finally {
	runtime?.close();
}
