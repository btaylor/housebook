<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	const dateFormat = new Intl.DateTimeFormat('en', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'UTC'
	});
</script>

<svelte:head><title>Settings · Housebook</title></svelte:head>

<p class="eyebrow">Your Housebook</p>
<h1>Settings</h1>
<p class="intro">Your House and the Household that looks after it.</p>
<section class="settings-card" aria-labelledby="account-heading">
	<h2 id="account-heading">My account</h2>
	<p class="hint">Email not verified. Housebook does not send email.</p>
	<form method="POST" action="?/profile#account-heading">
		{#if form?.section === 'profile'}
			{#if form.message}<p class="form-error" role="alert">{form.message}</p>
			{:else if form.saved}<p class="form-success" role="status">Account saved.</p>{/if}
		{/if}
		<label for="member-name">Your name</label>
		<input id="member-name" name="name" autocomplete="name" value={data.member.name} required />
		<label for="member-email">Email</label>
		<input
			id="member-email"
			name="email"
			type="email"
			autocomplete="email"
			autocapitalize="none"
			value={data.member.email}
			required
		/>
		<button class="primary" type="submit">Save account</button>
	</form>
</section>

<section class="settings-card" aria-labelledby="password-heading">
	<h2 id="password-heading">Change password</h2>
	<p class="hint">Use at least 12 characters. No other password rules.</p>
	<form method="POST" action="?/password#password-heading">
		<input type="hidden" name="username" autocomplete="username" value={data.member.email} />
		{#if form?.section === 'password'}
			{#if form.message}<p class="form-error" role="alert">{form.message}</p>
			{:else if form.saved}<p class="form-success" role="status">Password changed.</p>{/if}
		{/if}
		<label for="current-password">Current password</label>
		<input
			id="current-password"
			name="currentPassword"
			type="password"
			autocomplete="current-password"
			required
		/>
		<label for="new-password">New password</label>
		<input
			id="new-password"
			name="newPassword"
			type="password"
			autocomplete="new-password"
			required
		/>
		<button class="primary" type="submit">Change password</button>
	</form>
</section>

<section class="settings-card" aria-labelledby="sessions-heading">
	<h2 id="sessions-heading">My sessions</h2>
	<p class="hint">Browser and device hints may be approximate. Times are in UTC.</p>
	<ul class="session-list">
		{#each data.sessions as session (session)}
			<li>
				<strong>{session.deviceHint}</strong>
				{#if session.current}<span class="current-session">This device</span>{/if}
				<p class="hint">
					Last seen <time datetime={session.lastSeenAt.toISOString()}
						>{dateFormat.format(session.lastSeenAt)} UTC</time
					>
				</p>
			</li>
		{/each}
	</ul>
	{#if form?.section === 'sessions' && form.message}
		<p class="form-error" role="alert">{form.message}</p>
	{/if}
	<form method="POST" action="?/signOutAll">
		<button class="secondary" type="submit">Sign out all devices</button>
		<p class="hint">Ends every session, including this device. You will need to sign in again.</p>
	</form>
	<form method="POST" action={resolve('/(app)/sign-out')}>
		<button class="secondary" type="submit">Sign out</button>
		<p class="hint">Sign out of this device only.</p>
	</form>
</section>

<section class="settings-card" aria-labelledby="house-heading">
	<h2 id="house-heading">House</h2>
	<p class="hint">House currency · {data.house.currency}</p>
	<form method="POST" action="?/house#house-heading">
		{#if form?.section === 'house'}
			{#if form.message}<p class="form-error" role="alert">{form.message}</p>
			{:else if form.saved}<p class="form-success" role="status">House name saved.</p>{/if}
		{/if}
		<label for="house-name">House name</label>
		<input id="house-name" name="houseName" value={data.house.name} required />
		<button class="primary" type="submit">Save House name</button>
	</form>
</section>
