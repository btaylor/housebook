<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '../../../lib/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Contractors · Housebook</title>
</svelte:head>

<div class="contractor-heading">
	<div>
		<h1>Contractors</h1>
		<p class="intro">The people you call when your House needs a hand.</p>
	</div>
	<a class="secondary" href={resolve('/(app)/contractors/new')}>Add Contractor</a>
</div>
<form method="GET" class="archive-filter">
	<label>
		<input
			type="checkbox"
			name="archived"
			value="1"
			checked={data.includeArchived}
			onchange={(event) => event.currentTarget.form?.requestSubmit()}
		/>
		Show Archived
	</label>
	<noscript><button class="secondary" type="submit">Apply</button></noscript>
</form>

{#if data.contractors.length}
	<ul class="contractor-list">
		{#each data.contractors as contractor (contractor.id)}
			<li>
				<a href={resolve('/(app)/contractors/[id]', { id: contractor.id })}>
					<div>
						<h2>{contractor.name}</h2>
						{#if contractor.trade}<p>{contractor.trade}</p>{/if}
					</div>
					{#if contractor.archivedAt}<span class="coming-soon">Archived</span>{/if}
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<section class="empty-state">
		<div class="empty-icon"><Icon name="contractors" /></div>
		<h2>Good help, remembered.</h2>
		<p>
			{data.includeArchived
				? 'No Contractors yet. Add the first person or company you call for help.'
				: 'No active Contractors. Add a Contractor or show Archived to find one you used before.'}
		</p>
	</section>
{/if}
