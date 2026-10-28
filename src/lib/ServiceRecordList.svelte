<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Housebook } from './server/core';
	import { formatCost } from './service-records';
	let {
		records,
		currency
	}: { records: ReturnType<Housebook['serviceRecords']['list']>; currency: string } = $props();
</script>

{#if records.length}
	<ul class="service-record-list">
		{#each records as record (record.id)}
			<li>
				<a href={resolve('/(app)/maintenance-log/[id]', { id: record.id })}>
					<div class="record-summary">
						<time datetime={record.date}>{record.date}</time>
						{#if record.costCents !== null}
							<span>{formatCost(record.costCents, currency)} {currency}</span>
						{/if}
					</div>
					<p class="record-preview">{record.notes || 'No notes recorded.'}</p>
					<p class="hint">
						{record.contractor?.name ?? record.member?.name}
						{record.contractor?.archivedAt ? ' (Archived)' : ''}
						· {record.items.length
							? record.items
									.map((item) => item.name + (item.retiredDate ? ' (Retired)' : ''))
									.join(', ')
							: 'Whole House'}
					</p>
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<div class="empty-state">
		<h3>No Service Records yet</h3>
		<p>Log work to keep a record of what was done, who did it, and what it cost.</p>
	</div>
{/if}
