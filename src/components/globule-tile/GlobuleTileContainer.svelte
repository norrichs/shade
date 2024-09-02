
<script lang="ts">
  export let name: string;
  export let id: string;
</script>

<div class="globule-container">
  <div class="overlay">
    <div>{name}</div>
    <div>{id}</div>
  </div>
  <slot></slot>
</div>

<style>
	.globule-container {
		width: 200px;
		height: 200px;
		border-radius: 4px;
		border: 1px solid black;
		box-shadow: 2px 2px 10px 2px rgba(0, 0, 0, 0.2);
    position: relative;
	}

  .overlay {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
  }
</style>