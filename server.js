import { createServer } from 'node:http';
process.env.BODY_SIZE_LIMIT ??= '27M';

const command = process.argv[2] ?? 'serve';
if (command === 'reset-password') {
	try {
		await import(new URL('./build/handler.js', import.meta.url).href);
	} catch (error) {
		console.error(
			error instanceof Error ? error.message : 'Could not create a password reset link.'
		);
		process.exitCode = 1;
	}
} else if (command === 'serve' && process.argv.length <= 3) {
	await serve();
} else {
	console.error('Usage: node server.js [serve | reset-password <member-email>]');
	process.exitCode = 1;
}

async function serve() {
	const proxyProtocolHeader = process.env.PROTOCOL_HEADER;
	const internalProtocolHeader = 'x-housebook-transport';
	if (!proxyProtocolHeader) process.env.PROTOCOL_HEADER = internalProtocolHeader;

	/** @type {{ handler: import('node:http').RequestListener }} */
	const { handler } = await import(new URL('./build/handler.js', import.meta.url).href);
	const server = createServer((request, response) => {
		// Never trust a client-supplied transport header on a direct HTTP installation.
		if (!proxyProtocolHeader) request.headers[internalProtocolHeader] = 'http';
		handler(request, response);
	});

	const host = process.env.HOST ?? '0.0.0.0';
	const port = Number(process.env.PORT ?? 3000);
	server.listen(port, host, () => {
		const address = server.address();
		if (address && typeof address !== 'string') {
			console.info(`Listening on http://${host}:${address.port}`);
		}
	});

	for (const signal of ['SIGTERM', 'SIGINT']) {
		process.once(signal, () => server.close());
	}
}
