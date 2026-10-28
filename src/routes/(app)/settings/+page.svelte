<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let linkInput = $state<HTMLInputElement>();
	let shareStatus = $state('');
	const date = (value: Date) => value.toISOString().slice(0, 10);

	async function copyLink(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			shareStatus = 'Invite link copied.';
		} catch {
			linkInput?.focus();
			linkInput?.select();
			shareStatus = 'Link selected. Copy it from the Invite link field.';
		}
	}

	async function shareLink(url: string) {
		if (navigator.share) {
			try {
				await navigator.share({ title: 'Join our Household on Housebook', url });
				shareStatus = 'Invite shared.';
				return;
			} catch (error) {
				if (error instanceof Error && error.name === 'AbortError') return;
			}
		}
		await copyLink(url);
	}
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
<section class="settings-card" aria-labelledby="members-heading">
	<h2 id="members-heading">Members</h2>
	<p class="hint">Everyone in the Household has the same access.</p>
	<ul class="household-list" aria-label="Members">
		{#each data.members as member (member.id)}
			<li>
				<h3>{member.name}{member.id === data.member.id ? ' (you)' : ''}</h3>
				<p>{member.email}</p>
				<p class="hint">Email not verified.</p>
			</li>
		{/each}
	</ul>
</section>

<section class="settings-card" aria-labelledby="invites-heading">
	<h2 id="invites-heading">Invites</h2>
	<p class="hint">Invite someone to join the Household. No email is sent.</p>
	<form
		method="POST"
		action="?/createInvite"
		use:enhance={() => {
			shareStatus = '';
		}}
	>
		<button class="primary" type="submit">Create Invite</button>
	</form>
	{#if form?.invite}
		{@const invite = form.invite}
		<div class="invite-link">
			<label for="invite-link">Invite link</label>
			<input id="invite-link" bind:this={linkInput} readonly value={invite.url} />
			<p class="hint">
				Works once. Expires {date(invite.expiresAt)}. Save or share this link now; it is not stored.
			</p>
			<div class="invite-buttons">
				<button class="secondary" type="button" onclick={() => shareLink(invite.url)}
					>Share Invite</button
				>
				<button class="secondary" type="button" onclick={() => copyLink(invite.url)}
					>Copy link</button
				>
			</div>
			<p class="hint" role="status">{shareStatus}</p>
		</div>
	{/if}
	<h3 class="unused-heading">Unused Invites</h3>
	{#if data.invites.length}
		<ul class="household-list" aria-label="Unused Invites">
			{#each data.invites as invite (invite.id)}
				<li>
					<p>
						Created {date(invite.createdAt)} by {data.members.find(
							(member) => member.id === invite.createdBy
						)?.name ?? 'a Member'}
					</p>
					<p class="hint">Expires {date(invite.expiresAt)}</p>
					<form method="POST" action="?/revokeInvite" use:enhance>
						<input type="hidden" name="id" value={invite.id} />
						<button class="secondary" type="submit">Revoke Invite</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="hint">No unused Invites.</p>
	{/if}
</section>

<style>
	.household-list {
		list-style: none;
		padding: 0;
		margin: 1rem 0 0;
	}
	.household-list li {
		border-top: 1px solid var(--line);
		padding: 1rem 0;
		overflow-wrap: anywhere;
	}
	.household-list li:last-child {
		padding-bottom: 0;
	}
	.household-list p {
		font-size: 0.85rem;
	}
	.household-list form {
		margin-top: 0.75rem;
	}
	.invite-link {
		margin-top: 1.5rem;
	}
	.invite-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1rem;
	}
	.unused-heading {
		margin-top: 1.5rem;
	}
</style>
