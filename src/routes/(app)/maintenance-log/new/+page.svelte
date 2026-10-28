<script lang="ts">
	import { resolve } from '$app/paths';
	import ServiceRecordForm from '../../../../lib/ServiceRecordForm.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Log work · Housebook</title></svelte:head>
<a class="back-link" href={resolve('/(app)/maintenance-log')}>← Maintenance Log</a>
<h1>Log work</h1>
<p class="intro">Create a Service Record for work on the House.</p>
<ServiceRecordForm
	values={form?.values ?? data.values}
	options={data.options}
	currency={data.house.currency}
	message={form?.message}
	submitLabel="Save Service Record"
/>
