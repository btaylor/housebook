<script lang="ts">
	import { resolve } from '$app/paths';
	import ServiceRecordList from '../../../lib/ServiceRecordList.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Maintenance Log · Housebook</title></svelte:head>
<div class="page-heading">
	<div>
		<p class="eyebrow">{data.house.name}</p>
		<h1>Maintenance Log</h1>
		<p class="intro">Work on your House, newest first.</p>
	</div>
	<a class="secondary button-link" href={resolve('/(app)/maintenance-log/new')}>Log work</a>
</div>
<ServiceRecordList records={data.records} currency={data.house.currency} />
