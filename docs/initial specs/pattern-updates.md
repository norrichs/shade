# Tiled Patterns Updates

Outline patterns are pretty up-to-date, but there's some support lag on the tiled patterns side. There are also some new features to do.

## Pattern type parity

We're implementing some changes to how patterns are layed out, exported, and viewed, so it's becoming important that the differnt pattern types that exist are structured and generated in a way that they can all be supported by new features for free.

Examples:

- labelling should work with all pattern types in graceful ways
- pattern bounding boxes need to account for pattern and labels of all types
- pattern components need to be coordinatable by the different pattern layout methods

## Pattern Updates

Many of the current tiled patterns don't work well.
Pattern selection and configuring UI is bad
We need to unify the tiled pattern output to a format that works well

## Pattern output (outlining)

Currently tiled patterns output paths with stroke width  
We need to derive paths that would outline the thickness, then combine those paths into a big compound path with voids.

## Pattern label orientation

Adjust how labels are attached to tiled patterns.
Originate at the anchor point specified in the pattern definition
Set the ANGLE of the label relative to the nearest Quadrilateral edge.
The label text should be parallel to that edge, and the stem should be perpendicular.
