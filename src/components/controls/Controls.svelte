<script lang="ts">
  import type {LevelConfig} from "../../lib/shade"
  import type {ShadeAction} from "../../lib/use-shade-reducer"
  
  export let shadeConfig: LevelConfig[]
  export let reactiveShadeConfig: LevelConfig[] //: WritableSubscription<LevelConfig[]>
  export let shadeDispatch: (action: ShadeAction) => void

  const display = (lc: object): Array<string> => 
    Object.entries(lc).map(kv => typeof kv[1] === "object" ?  "\n" + display(kv[1]) : (`${kv[0]}: ${Math.round(kv[1] * 100) / 100}  `))
  

</script>


<div>
  <ul>
    {#each reactiveShadeConfig as lc, i}
      <li>
        <div>{display(lc)}</div>
        <div>
          <input type="range" value={lc.r} on:change={(e) => 
          {
            console.debug("e", e)
            shadeDispatch({type: "radius", payload: {level: i, value: e?.target?.value}})
          }
        }/>
        </div>
      </li>

    {/each}
    

  </ul>
</div>

