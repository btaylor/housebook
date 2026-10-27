<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Settings · Housebook</title></svelte:head>

<p class="eyebrow">Your Housebook</p>
<h1>Settings</h1>
<p class="intro">Your House and the Household that looks after it.</p>
<section class="settings-card">
	<h2>{data.house.name}</h2>
	<p class="hint">House currency · {data.house.currency}</p>
	<div class="member-details">
		<h3>{data.member.name}</h3>
		<p>{data.member.email}</p>
		<p class="hint">Email not verified. Housebook does not send email.</p>
	</div>
	<form method="POST" action={resolve('/(app)/sign-out')}>
		<button class="secondary" type="submit">Sign out</button>
		<p class="hint">Sign out of this device only.</p>
	</form>
</section>
