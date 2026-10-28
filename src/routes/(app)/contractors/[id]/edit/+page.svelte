<script lang="ts">
	import { resolve } from '$app/paths';
	import ContractorForm from '../../ContractorForm.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Edit {data.contractor.name} · Housebook</title>
</svelte:head>

<a class="back-link" href={resolve('/(app)/contractors/[id]', { id: data.contractor.id })}
	>← {data.contractor.name}</a
>
<h1>Edit Contractor</h1>
<ContractorForm
	values={form?.values ?? data.contractor}
	code={form?.code}
	message={form?.message}
	submitLabel="Save changes"
/>
