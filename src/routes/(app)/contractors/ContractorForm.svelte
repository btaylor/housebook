<script lang="ts">
	import type { ContractorInput, DomainErrorCode } from '../../../lib/server/core';
	let {
		values = { name: '' },
		code,
		message,
		submitLabel
	}: {
		values?: ContractorInput;
		code?: DomainErrorCode;
		message?: string;
		submitLabel: string;
	} = $props();
	const phoneMessage = $derived(code === 'invalid-contractor-phone' ? message : undefined);
	const emailMessage = $derived(code === 'invalid-contractor-email' ? message : undefined);
</script>

<form method="POST" class="contractor-form">
	{#if message && !phoneMessage && !emailMessage}
		<p class="form-error" role="alert">{message}</p>
	{/if}
	<label for="name">Name <span class="hint">(required)</span></label>
	<input id="name" name="name" value={values.name} required autocomplete="off" />
	<label for="phone">Phone</label>
	<input
		id="phone"
		name="phone"
		type="tel"
		value={values.phone ?? ''}
		autocomplete="off"
		aria-invalid={phoneMessage ? true : undefined}
		aria-describedby={phoneMessage ? 'phone-error' : undefined}
	/>
	{#if phoneMessage}<p id="phone-error" class="form-error" role="alert">{phoneMessage}</p>{/if}
	<label for="email">Email</label>
	<input
		id="email"
		name="email"
		type="text"
		inputmode="email"
		value={values.email ?? ''}
		autocomplete="off"
		autocapitalize="none"
		aria-invalid={emailMessage ? true : undefined}
		aria-describedby={emailMessage ? 'email-error' : undefined}
	/>
	{#if emailMessage}<p id="email-error" class="form-error" role="alert">{emailMessage}</p>{/if}
	<label for="trade">Trade</label>
	<input id="trade" name="trade" value={values.trade ?? ''} placeholder="e.g. Plumbing" />
	<label for="notes">Notes</label>
	<textarea id="notes" name="notes" rows="5" value={values.notes ?? ''}></textarea>
	<button class="primary" type="submit">{submitLabel}</button>
</form>
