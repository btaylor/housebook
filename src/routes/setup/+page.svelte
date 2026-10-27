<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Set up · Housebook</title>
</svelte:head>

<main class="welcome">
	<a class="brand" href={resolve('/')}
		>Housebook<span class="brand-dot" aria-hidden="true"></span></a
	>
	<section class="welcome-card">
		<p class="eyebrow">A fresh start</p>
		<h1>Every House has a story.</h1>
		<p class="intro">Keep yours together. Set up your House and become its first Member.</p>
		<form method="POST">
			{#if form?.message}<p class="form-error" role="alert">{form.message}</p>{/if}
			<label for="code">Setup code</label>
			<input
				id="code"
				name="code"
				type="password"
				autocomplete="off"
				required
				aria-describedby="code-hint"
			/>
			<p id="code-hint" class="hint">Find the one-time setup code in your Housebook server logs.</p>
			<fieldset>
				<legend>Your House</legend>
				<label for="houseName">House name</label>
				<input
					id="houseName"
					name="houseName"
					autocomplete="off"
					value={form?.values.houseName ?? ''}
					required
					placeholder="Willow House"
				/>
				<label for="currency">Currency</label>
				<select
					id="currency"
					name="currency"
					required
					value={form?.values.currency ?? 'USD'}
					aria-describedby="currency-hint"
				>
					{#each data.currencies as currency (currency)}<option value={currency}>{currency}</option
						>{/each}
				</select>
				<p id="currency-hint" class="hint">ISO 4217 code for costs in your Housebook.</p>
			</fieldset>
			<fieldset>
				<legend>First Member</legend>
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
				<p id="email-hint" class="hint">Used to sign in. Housebook does not send email.</p>
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
			</fieldset>
			<button class="primary" type="submit">Create House</button>
		</form>
	</section>
	<p class="welcome-footer">Your House. Your records. On your server.</p>
</main>
