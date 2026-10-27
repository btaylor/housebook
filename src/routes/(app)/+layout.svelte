<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon, { type IconName } from '../../lib/Icon.svelte';
	import type { LayoutProps } from './$types';
	let { data, children }: LayoutProps = $props();
	const tabs: { path: IconName; label: string }[] = [
		{ path: 'items', label: 'Items' },
		{ path: 'maintenance-log', label: 'Maintenance Log' },
		{ path: 'contractors', label: 'Contractors' },
		{ path: 'settings', label: 'Settings' }
	];
</script>

<div class="app-shell">
	<header class="app-header">
		<div>
			<a class="brand" href={resolve('/(app)/items')}
				>Housebook<span class="brand-dot" aria-hidden="true"></span></a
			>
			<p class="house-name">{data.house.name}</p>
		</div>
		<span class="member-name">{data.member.name}</span>
	</header>
	<nav class="tabs" aria-label="Main navigation">
		{#each tabs as tab (tab.path)}
			<a
				href={resolve(`/(app)/${tab.path}`)}
				aria-current={page.url.pathname === `/${tab.path}` ? 'page' : undefined}
			>
				<Icon name={tab.path} />
				<span>{tab.label}</span>
			</a>
		{/each}
	</nav>
	<main id="main-content" class="app-content">
		{@render children()}
	</main>
</div>
