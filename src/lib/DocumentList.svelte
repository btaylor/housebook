<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Housebook } from './server/core';
	let { documents }: { documents: ReturnType<Housebook['documents']['listForItem']> } = $props();
</script>

{#if documents.length}
	<ul class="document-list">
		{#each documents as document (document.id)}
			<li>
				<a href={resolve('/(app)/documents/[id]', { id: document.id })}>{document.title}</a>
				<p class="hint">
					{document.originalName} · {document.contentType} · {(document.size / 1024 / 1024).toFixed(
						2
					)} MB
				</p>
			</li>
		{/each}
	</ul>
{:else}
	<p class="hint">No Documents attached.</p>
{/if}
