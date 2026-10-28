<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '../../../lib/Icon.svelte';
	import { itemCategories } from '../../../lib/items';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Items · Housebook</title></svelte:head>

<div class="page-heading">
	<div>
		<p class="eyebrow">Your House, in detail</p>
		<h1>Items</h1>
		<p class="intro">A place for everything your House depends on.</p>
	</div>
	<a class="primary button-link" href={resolve('/(app)/items/new')}>Add Item</a>
</div>

<form method="GET" action={resolve('/(app)/items')} class="item-filters" role="search">
	{#if data.includeRetired}<input type="hidden" name="retired" value="1" />{/if}
	<div>
		<label for="search">Search by name</label>
		<input id="search" type="search" name="search" value={data.search} placeholder="Find an Item" />
	</div>
	<div>
		<label for="category">Category</label>
		<select id="category" name="category" value={data.category}>
			<option value="">All categories</option>
			{#each itemCategories as category (category)}
				<option value={category}>{category}</option>
			{/each}
		</select>
	</div>
	<button type="submit" class="secondary">Find Items</button>
	{#if data.search || data.category}<a href={resolve('/(app)/items')}>Clear filters</a>{/if}
</form>
<form method="GET" action={resolve('/(app)/items')} class="retired-filter">
	<input type="hidden" name="search" value={data.search} />
	<input type="hidden" name="category" value={data.category} />
	<label>
		<input
			type="checkbox"
			name="retired"
			value="1"
			checked={data.includeRetired}
			onchange={(event) => event.currentTarget.form?.requestSubmit()}
		/>
		Show Retired
	</label>
	<noscript><button class="secondary" type="submit">Apply</button></noscript>
</form>

{#if data.items.length}
	<p class="hint" role="status">{data.items.length} {data.items.length === 1 ? 'Item' : 'Items'}</p>
	<ul class="item-list">
		{#each data.items as item (item.id)}
			<li>
				<a href={resolve('/(app)/items/[id]', { id: item.id })}>
					<div class="item-list-icon"><Icon name="items" /></div>
					<div>
						<h2>{item.name}</h2>
						<p>{item.category}{item.location ? ` · ${item.location}` : ''}</p>
						{#if item.retiredDate}<span class="coming-soon">Retired</span>{/if}
					</div>
					<span class="item-arrow" aria-hidden="true">→</span>
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<section class="empty-state">
		<div class="empty-icon"><Icon name="items" /></div>
		{#if data.search || data.category}
			<h2>No matching Items.</h2>
			<p>Try another name or category, or clear your filters.</p>
		{:else}
			<h2>Your House’s story starts here.</h2>
			<p>
				Add an Item to keep its details and warranty dates together, or show Retired to find an old
				Item.
			</p>
		{/if}
	</section>
{/if}
