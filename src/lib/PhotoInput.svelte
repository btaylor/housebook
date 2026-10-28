<script lang="ts">
	let upload: HTMLInputElement;
	let camera: HTMLInputElement;
</script>

<label for="photo">Upload photo</label>
<input
	bind:this={upload}
	id="photo"
	name="photo"
	type="file"
	accept="image/jpeg,image/png,image/heic,.heic"
	onchange={() => (camera.value = '')}
/>
<label for="cameraPhoto">Take photo</label>
<input
	bind:this={camera}
	id="cameraPhoto"
	name="cameraPhoto"
	type="file"
	accept="image/jpeg,image/png,image/heic,.heic"
	capture="environment"
	onchange={() => (upload.value = '')}
/>
<p class="hint">JPEG, PNG, or HEIC. Up to 25 MB. HEIC photos are converted to JPEG.</p>
