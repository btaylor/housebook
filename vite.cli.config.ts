import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		ssr: 'src/reset-password.ts',
		outDir: 'build-cli',
		rollupOptions: { external: [/^drizzle-orm(?:\/|$)/] }
	}
});
