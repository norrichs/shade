## feature/shape-creator-upgrades

#### Input

`src/components/path-edit/PathEditInput.svelte`

- change it so that edits immediately update without needing to blur
- add 4-way clicker for selected point
- enable selecting a point to open numerical editor

fix PathEdit component so that shape edits don't cause focus to be lost

Fix Globule selection system 
- a particular globule selectable from the `Super` control menu, or by clicking on a globule in the three renderer
- clicking on three render (in standard interaction mode), should do the following
  - select globule (standard selection color)
  - select band (darker selection color)
  - select other members of subglobule (lighter selection color)
  - show stats in a dismissable top-lef corner window
    - selection address
    - names
    - all should be editable


New Contstraints component

- side length

  - if the shape is radially symmetrical, place endpoints at a radius giving a set distance between endpoints

  ```javascript
  given symmetry_number and side_length


  const alpha = Math.PI / symmetry_number
  const r = side_length / (2 * Math.sin(alpha))

  endpoint_1 = (0, r)
  endpoint_2 = (
    r * Math.cos(2*alpha), 
    r * Math.sin(2*alpha)
  )
  ```
- 
