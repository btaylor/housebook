<svelte:head>
	<title>Housebook</title>
	<meta name="description" content="A shared record of your House." />
</svelte:head>

<main>
	<h1>Housebook</h1>
	<p>A shared record of your House.</p>
	<p>Housebook is running. Your House’s story starts here.</p>
</main>

<style>
	:global(html) {
		color-scheme: light dark;
		font-family: system-ui, sans-serif;
		line-height: 1.5;
	}

	:global(body) {
		margin: 0;
	}

	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 3rem 1.5rem;
	}

	h1 {
		font-size: 2rem;
	}
</style>
