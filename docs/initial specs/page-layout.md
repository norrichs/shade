Plan a new feature.  Use superpowers

## Description:
Update to the cut pattern layout.
Currently we just have the standard linear layout of patterns, as well as a line-wrapping and some configs for spacing.

We'll add to that a few things:
- Page geometry (as in physical page, or sheet of paper, with real-world dimensions)
- New layout logic to distribute pattern components WITHIN page geometry
- Derivation and display in the UI of pattern and 3d geometry real-world size values based on the page geometry in use
- Floating Editor to configure Page geometry and layout configs

## Modes
Current pattern layout will stay the same.
Unify under a new config value `patternLayoutMode: 'linear' | 'line-wrap' | 'page', with a button that cycles through options where `line wrap` checkbox currently is. (replace that checkbox)

## Page geometry

A page is a rectangle with real world height and width.  
It is specified in code as `mm`, but we will provide interfaces to specify in terms of inches (1 inch === 25.4mm)
The relationship between real world page units and pattern / 3d geometry units is defined through a "pageScale" factor.  A default pageScale will be chosen so that 12" is approximately equivalent to 200pixels. (revisit this decision during development)

A "page" svg geometry component will be rendered on the pattern display and export.  It will be a filled rectangle UNDER any other geometry.  Multiple pages can be rendered at once.


## Editor

Controls:
- page size chooser (select from some hard-coded page sizes, 12inch x 12inch, 8.5inch x 11inch, 11inch x 17inch)
- custom page size chooser
- pageScale numerical input
- page margin size (in inches or mm)
- layout gap size

Display:
- Editor will have a display, showing a rendering of the page dimensions (svg)



## Layout

When `paternLayoutMode === 'page'`, patterns will be distributed so that they all fall within the boundaries of page geometry components.  The number of pages will depend on how many are required to contain all rendered patterns.

For this phase of work, a single layout algorithm will be used, but it should be implemented so that it can be swapped with others.

### Page layout algorithm

rules
- Sequentially lay out patterns in the current sort order (Tube order or End connection)
- Lay out only the in-range patterns
- If there is any pattern that is too large to fit within the bounds of the page, display an error toast, and offer to change `pageScale` so that it fits

layout algo
essentially, reproduce the css
```
display: flex;
flex-direction: row;
flex-wrap: wrap;
justify-content: flex-start;
align-items: flex-start;
```

The layout function will distribute the patterns sequentially, starting at the top left, aligning the first row towards the top of the page margin inset.  At the end of the first, row, when a pattern no longer fits on the first row, it will instead be distributed to the start of the second row.  With css flex layout, all of the second row would have their top edges aligned, with all of those top edges sitting BELOW the lowest point of the first row. 
HOWEVER, with this layout, as second-row (and third-row, etc) patterns are being placed, we will push them up as far as they can go without overlapping the bounding boxes of previous-row items. Is to increase packing efficiency.
Offsets for packing efficiency will be limited.  No pattern will be shifted such that it's vertical midpoint is higher than the nominal top edge of the row it is in.

## Derived units.
When in `page` patternLayoutMode, Find the points in the 3d model that are greatest and least in the X, Y and Z dimensions.  From those points, calculate X, Y and Z deltas, converted from 3d model units into units used to define the page, using pageScale as the translation factor.