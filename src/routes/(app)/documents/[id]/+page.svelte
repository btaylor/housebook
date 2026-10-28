<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>{data.document.title} · Housebook</title></svelte:head>
<a
	class="back-link"
	href={data.document.itemId
		? resolve('/(app)/items/[id]', { id: data.document.itemId })
		: resolve('/(app)/items')}>← Item</a
>
<h1 class="document-title">{data.document.title}</h1>
<p class="intro document-metadata">
	{data.document.originalName} · {data.document.contentType} · {(
		data.document.size /
		1024 /
		1024
	).toFixed(2)} MB
</p>
<div class="document-actions">
	<a
		class="secondary button-link"
		href={resolve('/(app)/documents/[id]/file', { id: data.document.id })}
		target="_blank"
		rel="noreferrer">Open Document</a
	>
	<form method="GET" action={resolve('/(app)/documents/[id]/file', { id: data.document.id })}>
		<button class="secondary" name="download" value="1" type="submit">Download Document</button>
	</form>
</div>
{#if data.document.contentType === 'application/pdf'}
	<object
		class="document-preview"
		data={resolve('/(app)/documents/[id]/file', { id: data.document.id })}
		type="application/pdf"
		aria-label={data.document.title}
	>
		<p>Use Open Document or Download Document to read this PDF.</p>
	</object>
{:else}
	<img
		class="document-image"
		src={resolve('/(app)/documents/[id]/file', { id: data.document.id })}
		alt={data.document.title}
	/>
{/if}
<section class="item-details">
	<h2>Manage Document</h2>
	{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}
	{#if form?.message}<p class="form-success" role="status">{form.message}</p>{/if}
	<form method="POST" action="?/rename">
		<label for="title">Document title</label>
		<input id="title" name="title" value={form?.title ?? data.document.title} required />
		<button class="primary" type="submit">Rename Document</button>
	</form>
	<form class="delete-document" method="POST" action="?/delete">
		<label for="confirm-delete">Type DELETE to delete this Document permanently</label>
		<input id="confirm-delete" required pattern="DELETE" autocomplete="off" />
		<button class="secondary" type="submit">Delete Document</button>
	</form>
</section>
