<script lang="ts">
  import {renderConfig, levelConfig, bandConfig} from "../../lib/stores"
</script>

<div>
  {#if $renderConfig.bandRange?.rangeStyle === "slice"}
    <section class="control-group">
      <label for="bandStart">BandStart</label>
      <input id="bandStart" type="number" bind:value={$renderConfig.bandRange.bandStart} />
      <label for="bandCount">BandCount</label>
      <input id="bandCount" type="number" bind:value={$renderConfig.bandRange.bandCount} />
      <label for="facetStart">FacetStart</label>
      <input id="facetStart" type="number" bind:value={$renderConfig.bandRange.facetStart} />
      <label for="facetCount">FacetCount</label>
      <input id="facetCount" type="number" bind:value={$renderConfig.bandRange.facetCount} />
      {#if $renderConfig.show}
        <div style="grid-column: 1 / 3; font-size: 20px;">Show</div>
        {#each Object.keys($renderConfig.show) as key}
          <label for={`show-${key}`}>{key}</label>
          <input id={`show-${key}`} type="checkbox" bind:checked={$renderConfig.show[key]} />
        {/each}
      {/if}
    </section>
  {/if}
  <section class="control-group">
    <label for="band-style">Band Style</label>
    <select id="band-style" bind:value={$bandConfig.bandStyle}>
      <option>circumference</option>
      <option>helical-right</option>
      <option>helical-left</option>
    </select>
    <label>Tab Style</label>
    <select bind:value={$bandConfig.tabStyle.style}>
      <option>full</option>
    </select>
  </section>
</div>
<section class="control-group">
  {#if $levelConfig}
    <label for="levels">Levels</label>
    <input id="levels" type="number" bind:value={$levelConfig.levels} />
    <label for="sides">Sides</label>
    <input id="sides" type="number" bind:value={$levelConfig.sides} />
    <label for="x_offset">X</label>
    <input id="x_offset" type="number" bind:value={$levelConfig.levelOffset.x} />
    <label for="y_offset">Y</label>
    <input id="y_offset" type="number" bind:value={$levelConfig.levelOffset.y} />
    <label for="z_offset">Z</label>
    <input id="z_offset" type="number" bind:value={$levelConfig.levelOffset.z} />
    <label for="rotx_offset">rotion X</label>
    <input id="rotx_offset" type="number" bind:value={$levelConfig.levelOffset.rotX} />
    <label for="roty_offset">rotation Y</label>
    <input id="roty_offset" type="number" bind:value={$levelConfig.levelOffset.rotY} />
    <label for="rotz_offset">rotation Z</label>
    <input id="rotz_offset" type="number" bind:value={$levelConfig.levelOffset.rotZ} />
  {/if}
</section>

<style>
  .control-group {
    margin: 4px;
    background-color: #ebe1e1;
    border-radius: 5px;
    padding: 10px;
    width: 200px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: repeat(10, 1.5em);
  }
  .control-group input {
    width: calc(100% - 10px);
  }

</style>