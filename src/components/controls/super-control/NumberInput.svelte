<script lang='ts'>
  export let value: number
  export let step = 1;
  export let min = 0;
  export let max = 100;


</script>

<input type="number" bind:value={value} {min} {step} {max} />

<style>
  input[type='number'] {
    -webkit-appearance: textfield;
    -moz-appearance: textfield;
    appearance: textfield;
    background-color: transparent;
    /* background-color: var(--color-highlight); */
    border: 0;
    /* padding: 4px 8px; */
    /* min-width: 30px;  */
    /* border-radius: 4px; */

  }

  input[type='number']:focus-visible {
    background-color: var(--color-active);
  }

  input[type='number']::-webkit-inner-spin-button,
  input[type='number']::-webkit-outer-spin-button {
    -webkit-appearance: none;
  }
</style>

