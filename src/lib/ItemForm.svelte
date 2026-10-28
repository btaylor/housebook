<script lang="ts">
	import { itemCategories, type ItemInput } from './items';
	import PhotoInput from './PhotoInput.svelte';
	let {
		values,
		message,
		submitLabel,
		includePhoto = false
	}: {
		values: ItemInput;
		message?: string;
		submitLabel: string;
		includePhoto?: boolean;
	} = $props();
</script>

<form method="POST" enctype="multipart/form-data" class="item-form">
	{#if message}<p class="form-error" role="alert">{message}</p>{/if}
	<p class="hint">Name and category are required. All other details are optional.</p>
	<label for="name">Name</label>
	<input id="name" name="name" value={values.name} required autocomplete="off" />
	<label for="category">Category</label>
	<select id="category" name="category" value={values.category} required>
		<option value="" disabled>Choose a category</option>
		{#each itemCategories as category (category)}
			<option value={category}>{category}</option>
		{/each}
	</select>
	<label for="location">Location</label>
	<input id="location" name="location" value={values.location ?? ''} />
	<fieldset>
		<legend>Identification</legend>
		<label for="make">Make</label>
		<input id="make" name="make" value={values.make ?? ''} />
		<label for="model">Model</label>
		<input id="model" name="model" value={values.model ?? ''} />
		<label for="serialNumber">Serial number</label>
		<input id="serialNumber" name="serialNumber" value={values.serialNumber ?? ''} />
	</fieldset>
	<fieldset>
		<legend>Dates and warranty</legend>
		<label for="installDate">Install date</label>
		<input
			id="installDate"
			name="installDate"
			type="date"
			max="9999-12-31"
			value={values.installDate ?? ''}
		/>
		<label for="warrantyEndDate">Warranty end date</label>
		<input
			id="warrantyEndDate"
			name="warrantyEndDate"
			type="date"
			max="9999-12-31"
			value={values.warrantyEndDate ?? ''}
			aria-describedby="warranty-hint"
		/>
		<p id="warranty-hint" class="hint">
			Leave blank if no warranty end date is known. Warranty stays active through this date.
		</p>
	</fieldset>
	<label for="notes">Notes</label>
	<textarea id="notes" name="notes" rows="5" value={values.notes ?? ''}></textarea>
	{#if includePhoto}
		<fieldset>
			<legend>Main photo</legend>
			<PhotoInput />
		</fieldset>
	{/if}
	<button class="primary" type="submit">{submitLabel}</button>
</form>
