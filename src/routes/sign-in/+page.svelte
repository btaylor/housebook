<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	let { form }: PageProps = $props();
</script>

<svelte:head>
	<title>Sign in · Housebook</title>
</svelte:head>

<main class="welcome sign-in">
	<a class="brand" href={resolve('/')}
		>Housebook<span class="brand-dot" aria-hidden="true"></span></a
	>
	<section class="welcome-card">
		<p class="eyebrow">Welcome back</p>
		<h1>Your House, in one place.</h1>
		<p class="intro">Sign in to your Household’s shared record.</p>
		<form method="POST">
			{#if form?.message}<p class="form-error" role="alert">{form.message}</p>{/if}
			<label for="email">Email</label>
			<input
				id="email"
				name="email"
				type="email"
				autocomplete="username"
				autocapitalize="none"
				value={form?.email ?? ''}
				required
			/>
			<label for="password">Password</label>
			<input
				id="password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
			/>
			<button class="primary" type="submit">Sign in</button>
		</form>
	</section>
	<p class="welcome-footer">Your House. Your records. On your server.</p>
</main>
