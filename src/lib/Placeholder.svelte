<script lang="ts">
	import Icon, { type IconName } from './Icon.svelte';
	let {
		title,
		description,
		empty,
		detail,
		icon
	}: {
		title: string;
		description: string;
		empty: string;
		detail: string;
		icon: IconName;
	} = $props();
</script>

<svelte:head><title>{title} · Housebook</title></svelte:head>

<p class="eyebrow">Your Housebook</p>
<h1>{title}</h1>
<p class="intro">{description}</p>
<section class="empty-state" aria-label={title}>
	<div class="empty-icon"><Icon name={icon} /></div>
	<h2>{empty}</h2>
	<p>{detail}</p>
	<span class="coming-soon">Coming soon</span>
</section>
