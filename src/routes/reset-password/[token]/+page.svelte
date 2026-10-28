<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Reset password · Housebook</title></svelte:head>

<main class="welcome">
	<a class="brand" href={resolve('/')}
		>Housebook<span class="brand-dot" aria-hidden="true"></span></a
	>
	<section class="welcome-card">
		<p class="eyebrow">Password recovery</p>
		{#if form?.reset}
			<h1>Password reset</h1>
			<p class="intro" role="status">
				Your password has changed. All your devices are signed out. Sign in with your new password.
			</p>
			<a class="primary" href={resolve('/sign-in')}>Sign in</a>
		{:else if data.valid}
			<h1>Set a new password</h1>
			<p class="intro">This link works once. Changing your password signs out all your devices.</p>
			<form method="POST">
				{#if form?.message}<p class="form-error" role="alert">{form.message}</p>{/if}
				<label for="password">New password</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="new-password"
					required
					aria-describedby="password-hint"
				/>
				<p id="password-hint" class="hint">Use at least 12 characters. No other password rules.</p>
				<button class="primary" type="submit">Reset password</button>
			</form>
		{:else}
			<h1>Reset link unavailable</h1>
			<p class="intro" role="alert">
				This reset link is invalid, expired, or already used. Ask a Member or the installer for a
				new link.
			</p>
			<a href={resolve('/sign-in')}>Sign in</a>
		{/if}
	</section>
</main>

<style>
	a.primary {
		display: block;
		text-align: center;
		text-decoration: none;
	}
</style>
