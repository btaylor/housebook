<script lang="ts">
	import { resolve } from '$app/paths';
	import DocumentList from '../../../../lib/DocumentList.svelte';
	import DocumentUpload from '../../../../lib/DocumentUpload.svelte';
	import { formatCost } from '../../../../lib/service-records';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
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
<section class="item-details">
	<h2>Documents</h2>
	{#if form?.error}<p class="form-error upload-feedback" role="alert">{form.error}</p>{/if}
	{#if form?.message}<p class="form-success upload-feedback" role="status">{form.message}</p>{/if}
	<DocumentList documents={data.record.documents} />
	<DocumentUpload title={form?.title} />
</section>
<details class="delete-record">
	<summary>Delete Service Record</summary>
	<form method="POST" action="?/delete">
		<p class="hint">
			This permanently deletes the Service Record from all linked Items and deletes its Documents
			and their files.
		</p>
		<button class="secondary" type="submit">Confirm deletion</button>
	</form>
</details>
