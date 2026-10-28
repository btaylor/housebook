<script lang="ts">
	import { resolve } from '$app/paths';
	import ServiceRecordList from '../../../../lib/ServiceRecordList.svelte';
	import PhotoInput from '../../../../lib/PhotoInput.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
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
{#if form?.error}<p class="form-error upload-feedback" role="alert">{form.error}</p>{/if}
{#if form?.message}<p class="form-success upload-feedback" role="status">{form.message}</p>{/if}
<section class="item-details">
	<h2>Main photo</h2>
	{#if data.item.photoId}
		<img
			class="item-photo"
			src={`${resolve('/(app)/items/[id]/photo', { id: data.item.id })}?v=${data.item.photoId}`}
			alt={`Main photo of ${data.item.name}`}
		/>
		<form method="POST" action="?/removePhoto">
			<button class="secondary" type="submit">Remove photo</button>
		</form>
	{:else}
		<p class="hint">No photo recorded.</p>
	{/if}
	<details class="photo-controls">
		<summary>{data.item.photoId ? 'Replace photo' : 'Add photo'}</summary>
		<form method="POST" action="?/photo" enctype="multipart/form-data">
			<PhotoInput />
			<button class="primary" type="submit">Save photo</button>
		</form>
	</details>
</section>
<section class="item-details">
	<h2>Documents</h2>
	{#if data.documents.length}
		<ul class="document-list">
			{#each data.documents as document (document.id)}
				<li>
					<a href={resolve('/(app)/documents/[id]', { id: document.id })}>{document.title}</a>
					<p class="hint">
						{document.originalName} · {document.contentType} · {(
							document.size /
							1024 /
							1024
						).toFixed(2)} MB
					</p>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="hint">No Documents attached.</p>
	{/if}
	<details class="photo-controls">
		<summary>Attach Document</summary>
		<form method="POST" action="?/document" enctype="multipart/form-data">
			<label for="document-title">Document title</label>
			<input id="document-title" name="title" value={form?.title ?? ''} required />
			<label for="document-upload">Document</label>
			<input
				id="document-upload"
				name="document"
				type="file"
				accept="application/pdf,image/jpeg,image/png,image/heic,.heic"
				required
			/>
			<p class="hint">PDF, JPEG, PNG, or HEIC. Up to 25 MB.</p>
			<button class="primary" type="submit">Attach Document</button>
		</form>
	</details>
</section>
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
<section class="service-history" aria-label="Service Records">
	<div class="page-heading">
		<h2>Service Records</h2>
		<a
			class="secondary button-link"
			href="{resolve('/(app)/maintenance-log/new')}?item={encodeURIComponent(data.item.id)}"
			>Log work</a
		>
	</div>
	<ServiceRecordList records={data.records} currency={data.house.currency} />
</section>
