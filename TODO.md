## Housekeeping / quality of life / usability
- clean up all errors
- put all configs into writable stores
- wire up configs to controls
- create derived stores to hold calculated geometry (maybe?)
- move type definitions into separate files
- implement add and remove beziers to bezier editor
- start dividing rotated-shapes into separate files with a single export file

## Small Features

- extend bezier editor for radial symmetry
- implement a radial shape designer control
- implement an "svg holes" workflow
  - scoring
  - circular holes
  - pattern mapping

## Major Features

- Data persistence
  - local storage hook
    - for all config objects, onChange, write a local storage representation
    - onLoad, use local storage configs if they exists, otherwise, use defaults
    - reset function restores to defaults
    - current config state can be persisted to named local storage representation
    - export config to file

- SVG export
  - usning `transform` implement a shape arranging function which will aarrange shapes in construction order (eg strut0, band0, strut1, band1, etc) with spacing and canvas placement based on shape bounds (also rotate based on longest axis, etc)
  - add cuttable numbers to each
  

- curve-based interface for specifying varying parameters
  - ends are y-locked to ZCurve
  - for: rot, coordinate offsets, detail


- new level parameter: detail
  - depends on radial shape having endpoints locked
  - when generating level prototypes
    - translate points from (x,y) to (r, theta)
    - baseline = endpoints r
    - for each non-endpoint, calculate relative_r = (r - baseline_r)
    - scale relative_r by detail parameter
    - new_r = baseline + scaled(relative_r)
    - translate (new_r, theta) -> (x, y)


- re-implement struts and rings
  - set up in LevelConfig
  - width: number
  - direction?: 'internal' | 'external' (default internal)
  - conform to bamdStyle: "circumference" | "helical-right" | "helical-left"

- implement tabStyle: StrutTab
  - coplanar with strut quadrilateral (2 triangles)
  - inset: number
    - need some sort of collision detection, so that tabs on the concave side of a curve don't overlap adjacent tabs.
    - probably easiest to do this at the flattendBand layer 
    (triangle.containsPoint(vertex)), and just allow impossible geometry at the 3d layer
    - if overlapping, find point where extension of top line intersects extenstion of adjacent tab's side line, and use that point
  - width: {type: 'fixed' | 'percentage', value: number}

    >Note: Implementing the above may requre some amount of parallel calculations if the geometry is to be truly validated in 3d.  Basic outline and collision algorithms will best be done from flattened state.

    >Maybe  _all_ tab calculations are moved to flattened band (simplifying a lot), and a transformed back into 3d for display

    > Pattern Pipeline: baseGeometry -> flattenedBaseGeometry -> tabbedGeometry -> decoratedGeometry -> patterns

    > 3D Pipeline: baseGeometry.clone() -> graftTabs(tabbedGeometry) -> graftDecorations(decoratedGeometry) -> renderGeometry


  - attach StrutTabs to strut objects, as well as facet objects

  - implement strutpockets
    - outline of flattened struts, with tabs subtracted, for building up a strut sandwitch with tightfitting tab pockets

- implement alternate 'rotated shape' algorithm
  - use divisions = config.divisions * 2.  Construct facets as  

        ```
        rotZ = whatever, but helical bands still result

        {
          a: level[n].vertex[m], 
          b: level[n].vertex[m + 2], 
          c: level[n + 1].vertex[m + 1] 
        }
        ```

