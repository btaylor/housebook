<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Join the Household · Housebook</title></svelte:head>

<main class="welcome">
	<a class="brand" href={resolve('/')}
		>Housebook<span class="brand-dot" aria-hidden="true"></span></a
	>
	<section class="welcome-card">
		<p class="eyebrow">You're invited</p>
		{#if data.valid}
			<h1>Join {data.houseName}</h1>
			<p class="intro">Become a Member of the Household. Set your details to get started.</p>
			<form method="POST">
				{#if form?.message}<p class="form-error" role="alert">{form.message}</p>{/if}
				<label for="memberName">Your name</label>
				<input
					id="memberName"
					name="memberName"
					autocomplete="name"
					value={form?.values.memberName ?? ''}
					required
				/>
				<label for="email">Email</label>
				<input
					id="email"
					name="email"
					type="email"
					autocomplete="username"
					autocapitalize="none"
					value={form?.values.email ?? ''}
					required
					aria-describedby="email-hint"
				/>
				<p id="email-hint" class="hint">
					Used to sign in. Housebook does not send email or verify addresses.
				</p>
				<label for="password">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="new-password"
					minlength="12"
					required
					aria-describedby="password-hint"
				/>
				<p id="password-hint" class="hint">
					At least 12 characters. A memorable passphrase works well.
				</p>
				<button class="primary" type="submit">Join Household</button>
			</form>
		{:else}
			<h1>Invite unavailable</h1>
			<p class="intro" role="alert">
				This Invite is invalid, expired, or no longer available. Ask a Member for a new Invite.
			</p>
			<p class="intro"><a href={resolve('/sign-in')}>Sign in</a> if you are already a Member.</p>
		{/if}
	</section>
</main>
