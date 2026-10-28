<script lang="ts">
	import { resolve } from '$app/paths';
	import ContractorForm from '../ContractorForm.svelte';
	import type { PageProps } from './$types';
	let { form }: PageProps = $props();
</script>

<svelte:head>
	<title>Add Contractor · Housebook</title>
</svelte:head>

<a class="back-link" href={resolve('/(app)/contractors')}>← Contractors</a>
<h1>Add Contractor</h1>
<p class="intro">Keep their details close for the next time your House needs help.</p>
<ContractorForm
	values={form?.values}
	code={form?.code}
	message={form?.message}
	submitLabel="Save Contractor"
/>
