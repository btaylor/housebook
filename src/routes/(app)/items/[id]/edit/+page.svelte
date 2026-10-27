<script lang="ts">
	import { resolve } from '$app/paths';
	import ItemForm from '../../../../../lib/ItemForm.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Edit {data.item.name} · Housebook</title></svelte:head>
<a class="back-link" href={resolve('/(app)/items/[id]', { id: data.item.id })}>← {data.item.name}</a
>
<h1>Edit Item</h1>
<p class="intro">Keep your Item’s details up to date.</p>
<ItemForm values={form?.values ?? data.item} message={form?.message} submitLabel="Save Item" />
