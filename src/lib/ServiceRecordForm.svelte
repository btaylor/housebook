<script lang="ts">
	import type { Housebook } from './server/core';
	import type { ServiceRecordInput } from './service-records';
	let {
		values,
		options,
		currency,
		message,
		submitLabel
	}: {
		values: ServiceRecordInput;
		options: ReturnType<Housebook['serviceRecordOptions']>;
		currency: string;
		message?: string;
		submitLabel: string;
	} = $props();
	const performer = $derived(
		values.contractorId
			? `contractor:${values.contractorId}`
			: values.memberId
				? `member:${values.memberId}`
				: ''
	);
</script>

<form method="POST" class="item-form">
	{#if message}<p class="form-error" role="alert">{message}</p>{/if}
	<label for="date">Date <span class="hint">(required)</span></label>
	<input id="date" name="date" type="date" max="9999-12-31" value={values.date} required />
	<label for="performer">Done by <span class="hint">(required)</span></label>
	<select id="performer" name="performer" value={performer} required>
		<option value="" disabled>Choose one Contractor or Member</option>
		<optgroup label="Contractors">
			{#each options.contractors as contractor (contractor.id)}
				<option value={`contractor:${contractor.id}`}>
					{contractor.name}{contractor.archivedAt ? ' (Archived · current)' : ''}
				</option>
			{/each}
		</optgroup>
		<optgroup label="Members">
			{#each options.members as member (member.id)}
				<option value={`member:${member.id}`}>{member.name}</option>
			{/each}
		</optgroup>
	</select>
	<p class="hint">Archived Contractors are kept only on their existing Service Records.</p>
	<label for="notes">Notes</label>
	<textarea id="notes" name="notes" rows="5" value={values.notes}></textarea>
	<label for="cost">Cost ({currency}) <span class="hint">(optional)</span></label>
	<input
		id="cost"
		name="cost"
		inputmode="decimal"
		value={values.cost ?? ''}
		placeholder="0.00"
		aria-describedby="cost-hint"
	/>
	<p id="cost-hint" class="hint">Use a decimal point and up to two decimal places.</p>
	<fieldset class="service-items">
		<legend>Items covered</legend>
		<p class="hint">Leave all Items unchecked for work on the whole House.</p>
		{#each options.items as item (item.id)}
			<label>
				<input
					type="checkbox"
					name="itemIds"
					value={item.id}
					checked={values.itemIds?.includes(item.id) ?? false}
				/>
				<span>{item.name}{item.retiredDate ? ' (Retired)' : ''}</span>
			</label>
		{:else}
			<p class="hint">There are no Items yet. This Service Record will cover the whole House.</p>
		{/each}
	</fieldset>
	<button class="primary" type="submit">{submitLabel}</button>
</form>
