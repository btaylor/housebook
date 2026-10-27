<script lang="ts">
	export type IconName = 'items' | 'maintenance-log' | 'contractors' | 'settings';
	let { name }: { name: IconName } = $props();
	const paths = {
		items: 'M3 7 12 3l9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10',
		'maintenance-log': 'M8 5H5v16h14V5h-3M8 3h8v4H8V3Zm0 9h8m-8 4h5',
		contractors:
			'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
		settings: 'M4 7h16M4 17h16M8 4v6m8 4v6'
	};
</script>

<svg
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d={paths[name]} />
</svg>
