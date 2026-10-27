<script lang="ts">
	import type { ContractorInput } from '../../../lib/server/core';
	let {
		values = { name: '' },
		message,
		submitLabel
	}: { values?: ContractorInput; message?: string; submitLabel: string } = $props();
</script>

<form method="POST" class="contractor-form">
	{#if message}<p class="form-error" role="alert">{message}</p>{/if}
	<label for="name">Name <span class="hint">(required)</span></label>
	<input id="name" name="name" value={values.name} required autocomplete="off" />
	<label for="phone">Phone</label>
	<input id="phone" name="phone" type="tel" value={values.phone ?? ''} autocomplete="off" />
	<label for="email">Email</label>
	<input
		id="email"
		name="email"
		type="email"
		value={values.email ?? ''}
		autocomplete="off"
		autocapitalize="none"
	/>
	<label for="trade">Trade</label>
	<input id="trade" name="trade" value={values.trade ?? ''} placeholder="e.g. Plumbing" />
	<label for="notes">Notes</label>
	<textarea id="notes" name="notes" rows="5" value={values.notes ?? ''}></textarea>
	<button class="primary" type="submit">{submitLabel}</button>
</form>
