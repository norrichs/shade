## Global pattern mapping

Implement a method for defining a set of SVG paths that can be subdivided and mapped to a 3d globule surface


### Subdivision:

Apply a set of quadrilaterals, subdividing the SVG paths at intersections with the quadrilateral edges.

#### polar coordinate pattern
- for a generally circular pattern made up of paths, draw a subdivision polar grid
- polar grid could have some amount of distortion, user defined.  E.G. variable or dynamic spacing of `r` values, rotation values offsetting `theta` values at each `r` value 

#### cylindrical coordinate pattern
- 