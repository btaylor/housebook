<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.item.name} · Housebook</title></svelte:head>
<a class="back-link" href={resolve('/(app)/items')}>← Items</a>
<div class="page-heading">
	<div>
		<p class="eyebrow">{data.item.category}</p>
		<h1>{data.item.name}</h1>
		{#if data.item.location}<p class="intro">{data.item.location}</p>{/if}
	</div>
	<a class="secondary button-link" href={resolve('/(app)/items/[id]/edit', { id: data.item.id })}
		>Edit Item</a
	>
</div>
<section class="item-details">
	<h2>Item details</h2>
	<dl>
		<dt>Category</dt>
		<dd>{data.item.category}</dd>
		<dt>Location</dt>
		<dd>{data.item.location ?? 'Not recorded'}</dd>
		<dt>Make</dt>
		<dd>{data.item.make ?? 'Not recorded'}</dd>
		<dt>Model</dt>
		<dd>{data.item.model ?? 'Not recorded'}</dd>
		<dt>Serial number</dt>
		<dd>{data.item.serialNumber ?? 'Not recorded'}</dd>
		<dt>Install date</dt>
		<dd>{data.item.installDate ?? 'Not recorded'}</dd>
	</dl>
	<div class="warranty-summary">
		<h2>Warranty</h2>
		{#if data.item.warrantyStatus}
			<p class="warranty-status" class:ended={data.item.warrantyStatus === 'ended'}>
				Warranty {data.item.warrantyStatus}
			</p>
			<p class="hint">
				Warranty end date: <time datetime={data.item.warrantyEndDate ?? undefined}
					>{data.item.warrantyEndDate}</time
				>
			</p>
		{:else}
			<p class="hint">No warranty end date recorded.</p>
		{/if}
	</div>
	<h2>Notes</h2>
	<p class="item-notes">{data.item.notes ?? 'No notes recorded.'}</p>
</section>
