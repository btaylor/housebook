<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.contractor.name} · Housebook</title>
</svelte:head>

<a class="back-link" href={resolve('/(app)/contractors')}>← Contractors</a>
<div class="contractor-heading">
	<div>
		<p class="eyebrow">Contractor</p>
		<h1>{data.contractor.name}</h1>
		{#if data.contractor.trade}<p class="intro">{data.contractor.trade}</p>{/if}
	</div>
	<a class="secondary" href={resolve('/(app)/contractors/[id]/edit', { id: data.contractor.id })}
		>Edit Contractor</a
	>
</div>
<section class="contractor-details" aria-label="Contractor details">
	{#if data.contractor.archivedAt}
		<p class="archived-notice">
			Archived on
			<time datetime={data.contractor.archivedAt.toISOString().slice(0, 10)}
				>{data.contractor.archivedAt.toISOString().slice(0, 10)}</time
			>. Kept for your records.
		</p>
	{/if}
	<dl>
		<dt>Phone</dt>
		<dd>
			{#if data.contractor.phone}
				<a href={`tel:${data.contractor.phone}`}>{data.contractor.phone}</a>
			{:else}Not recorded{/if}
		</dd>
		<dt>Email</dt>
		<dd>
			{#if data.contractor.email}
				<a href={`mailto:${data.contractor.email}`}>{data.contractor.email}</a>
			{:else}Not recorded{/if}
		</dd>
		<dt>Notes</dt>
		<dd class="contractor-notes">{data.contractor.notes || 'No notes yet.'}</dd>
	</dl>
	<form method="POST" action={data.contractor.archivedAt ? '?/unarchive' : '?/archive'}>
		<p class="hint">
			{data.contractor.archivedAt
				? 'Un-Archive to include this Contractor when you record new work.'
				: 'Archive a Contractor you no longer use. Their details stay in your Housebook.'}
		</p>
		<button class="secondary" type="submit">
			{data.contractor.archivedAt ? 'Un-Archive Contractor' : 'Archive Contractor'}
		</button>
	</form>
</section>
