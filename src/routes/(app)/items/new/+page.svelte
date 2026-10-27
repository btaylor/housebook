<script lang="ts">
	import { resolve } from '$app/paths';
	import ItemForm from '../../../../lib/ItemForm.svelte';
	import type { PageProps } from './$types';
	let { form }: PageProps = $props();
</script>

<svelte:head><title>Add Item · Housebook</title></svelte:head>
<a class="back-link" href={resolve('/(app)/items')}>← Items</a>
<h1>Add Item</h1>
<p class="intro">Keep the details you will want to find again.</p>
<ItemForm
	values={form?.values ?? { name: '', category: '' }}
	message={form?.message}
	submitLabel="Add Item"
/>
