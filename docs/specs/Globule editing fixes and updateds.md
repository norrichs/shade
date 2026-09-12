Plan and implement the following
use superpowers
make a new branch off main

## Floating editor UI persistence

Currently most floating editors close on click-away
Let's invert the specification logic
By default they should stay open on clickaway, and they need a prop to specify that they close on clickaway
That will change the behavior of current editors, which is intended

## Globule cross section divisions

Globule cross section editor and therefor globule cross section geometry has a `sampling` parameter.
Currently, `by sub curve` works as expected (subdivide individual bezier curves)

#### However, `by whole curve` is not correct.

I expect this division method to work as follows:

- Join all bezier's of the ENTIRE cross section. (I.e. CurvePath in three js). That means for a "radial" cross section with 7 "sides", and 2 bezier curvers per "side", the total bezier curve count is 14.
- Evenly divide that compound curve by the number of divisions. This will result in non-radially symmetric boundaries

#### Also I want a 3rd option

In the UI, this option will be `by side` (pick an appropriate variable name)
It is to work as follows:

- Join the bezier curves of each side in a CurvePath
- evenly divide the side-based CurvePaths
- e.g. for a 7 side radial cross section, with 5 bezier curves defined for a side, with `sampling: by side`, and "divisions: 3", there will be a total of 21 bands

## Globule cross section rendering

The "preview" of the cross section in the Globule Cross Section path editor is BAD. It always has been, even in the legacy "Shape" editor.
With `radial` globule cross sections, combining of the bezier's that define each side into an overall shape is often incorrect in the editor. Instead of the "last" point of a side sharing the position of the first point of the next side, often, the resulting shape joins non-contiguous points, resulting in weird loops
Ask for a screenshot.

### Dimension measurer

When the Pattern Layout is specified as as "page", we measure the x, y, and z dimensions of the model, scaled to real world units via `pageScale`, and render some automatically placed indicators on the 3d model, which indicate where dimension measurements are taken on the model.
I would like to be able to make arbitrary measurements.

From the `Pattern Layout` editor, add a "New measurement" button.
When clicked, we activate a selection mode.
While in that selection mode, clicks on the 3d model render will detect the FIRST intersection with the model, then find the nearest Vector3 node of the model.
Place an indicator (magenta) at that point.  
Once an unmatched magenta indicator has been placed, a subsequent click will select a second point (black). At this time the first indicator ALSO becomes black. (magenta only when unmatched.). The matched pair of points will be used to measure a new dimension, displayed in the "Model size" section of Pattern Layout. Instead of "X", "Y, or "Z", label, these can be numbered, and text colored black
We should be able to take multiple measurements.
Each "black", dimension in the list also shows a small "X" button which clears that dimension and indicators.
This kind of indicator is not persisted. Changes to 3d geometry clear these, since Vector3 node identity is not static. It doesn't survive reload either.
It SHOULD survive changes to pattern and pattern layout params however.

Prior work:
I have previously implemented functionality for clicking the model to set indicators, as well as selection modes.
That past work should not necessarily be reused, but should be reviewed for good coding practices. With three JS click handling, care must be taken to ensure we capture only the FIRST intersection. ray intersection on it's own will result in multiple intersections. This is a solved issue, but you need to make sure to use that solution.
