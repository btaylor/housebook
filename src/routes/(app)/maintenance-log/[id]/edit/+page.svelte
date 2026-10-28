<script lang="ts">
	import { resolve } from '$app/paths';
	import ServiceRecordForm from '../../../../../lib/ServiceRecordForm.svelte';
	import { costInputValue } from '../../../../../lib/service-records';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Edit Service Record · Housebook</title></svelte:head>
<a class="back-link" href={resolve('/(app)/maintenance-log/[id]', { id: data.record.id })}
	>← Service Record</a
>
<h1>Edit Service Record</h1>
<ServiceRecordForm
	values={form?.values ?? {
		...data.record,
		cost: costInputValue(data.record.costCents),
		itemIds: data.record.items.map((item) => item.id)
	}}
	options={data.options}
	currency={data.house.currency}
	message={form?.message}
	submitLabel="Save changes"
/>
