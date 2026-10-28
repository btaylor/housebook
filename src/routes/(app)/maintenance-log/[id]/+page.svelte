<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatCost } from '../../../../lib/service-records';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Service Record · {data.record.date} · Housebook</title></svelte:head>
<a class="back-link" href={resolve('/(app)/maintenance-log')}>← Maintenance Log</a>
<div class="page-heading">
	<div>
		<p class="eyebrow"><time datetime={data.record.date}>{data.record.date}</time></p>
		<h1>Service Record</h1>
	</div>
	<a
		class="secondary button-link"
		href={resolve('/(app)/maintenance-log/[id]/edit', { id: data.record.id })}
		>Edit Service Record</a
	>
</div>
<section class="item-details" aria-label="Service Record details">
	<dl>
		<dt>Date</dt>
		<dd><time datetime={data.record.date}>{data.record.date}</time></dd>
		<dt>Done by</dt>
		<dd>
			{#if data.record.contractor}
				<a href={resolve('/(app)/contractors/[id]', { id: data.record.contractor.id })}
					>{data.record.contractor.name}</a
				>
				{data.record.contractor.archivedAt ? ' (Archived)' : ''}
			{:else}
				{data.record.member?.name} <span class="hint">(Member)</span>
			{/if}
		</dd>
		<dt>Cost ({data.house.currency})</dt>
		<dd>
			{data.record.costCents === null
				? 'Not recorded'
				: formatCost(data.record.costCents, data.house.currency)}
		</dd>
		<dt>Items covered</dt>
		<dd>
			{#each data.record.items as item (item.id)}
				<p>
					<a href={resolve('/(app)/items/[id]', { id: item.id })}>{item.name}</a>
					{item.retiredDate ? ' (Retired)' : ''}
				</p>
			{:else}
				Whole House
			{/each}
		</dd>
	</dl>
	<h2 class="service-notes-heading">Notes</h2>
	<p class="item-notes">{data.record.notes || 'No notes recorded.'}</p>
</section>
<details class="delete-record">
	<summary>Delete Service Record</summary>
	<form method="POST" action="?/delete">
		<p class="hint">This permanently deletes the Service Record from all linked Items.</p>
		<button class="secondary" type="submit">Confirm deletion</button>
	</form>
</details>
