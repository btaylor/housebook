<script lang="ts">
	let { title = '' }: { title?: string } = $props();
</script>

<details class="photo-controls">
	<summary>Attach Document</summary>
	<form method="POST" action="?/document" enctype="multipart/form-data">
		<label for="document-title">Document title</label>
		<input id="document-title" name="title" value={title} required />
		<label for="document-upload">Document</label>
		<input
			id="document-upload"
			name="document"
			type="file"
			accept="application/pdf,image/jpeg,image/png,image/heic,.heic"
			required
		/>
		<p class="hint">PDF, JPEG, PNG, or HEIC. Up to 25 MB.</p>
		<button class="primary" type="submit">Attach Document</button>
	</form>
</details>
