## Geodesic Projection

1. establish a center point
2. define a polyhedra (tetrahedron, icosohedron, geodesic polyhedra, etc.)
3. define curves inscribed within the polyhedra polygons
4. define a 3d geometry that the polyhedra fits within, such as a sphere
5. define a cross section relative to a line that splits it into 2 halves


draw rays from the center point, through points on the polyhedra, ending at certain intersections
  - point / ray density is a parameter.  Use the same number of divisions for edge and inscribed curve rays
  - rays through the polygon edges `ray1` establish the center points of cross sections, and end at the surface of the outer 3d geometry `p1`.  The fan of `ray1` rays through each point establish a plane `plane1`
  - rays through the inscribed curves `ray2` establish the widths of half cross sections.  We draw a line from `p1`, perpendicular to `ray1`, which intersect `ray2`, forming a right triangle, and describing a plane `plane2`.  `segment1` is the 3rd edge of this triangle.
  - for each triangle, place a half cross section in the plane of the triangle, with center aligned with the right angle point, and the cut edge colinear with `ray1`
  - scale the width of the half cross section to have the same width as `segment1` length
  - scale the height of the half cross section
  - connect points between adjacent cross sections, creating "bands" which wrap around spines

There will need to be some kind of validity enforcement to maintain alignments:
- endpoints of inscribed curves need to match


Make it so that inscribed curves are defined as a line and a curve, each of which ends on parallel horizontal lines.  The curve is distorted to end on a line running from polygon vertex to polygon center point.  Also edited in that form.  In this way, the same curve could be applied to different geometries

Make a curve / polygon assignment interface, so that individual component curves can be assigned to one side of an edge


TODO:

- Make a config type
- Make a default config
  - Icosohedron
  - Sphere
  - Inscribed curve
  - Cross section curve
  - Edge
    - collates configs for:
      - line segment 
      - bisecting angles
      - inscribed curve section
      - half cross section
      ```
      type Edge = {
        p0: { point: Point3, angle: number},
        p1: { point: Point3, angle: number},
        curve: BezierConfig[],
        cross: BezierConfig[]
      }
      type Polygon = {
        edges: Edge[]
      }


- Implement stores, generators, and components:
  - 3d shape
  - Polyhedra
  - Inscribed curves (on 3d)
  - Ray traced triangles
  - Arrayed cross sections
  - Bands
- Feed band store into pattern store
- Implement editors
  - Polyhedra
    - defaults: tetrahedron, cube, dodecahedron, icosohedron
    - copy / paste coordinates
    - grab coordinate from selections on other models
    - some kind of pipeline from Sketchup would be ideal
  - Inscribed curve
    - based on pathEdit
    - symmetries / curve copying
    - constraints that translate to different geometries
    - Single curve mode, Inscribed mode
    - Smooth mode / sampled mode
    - Catmull-rom ?
  - Cross section curve
    - bilateral symmetry toggle
    - points smoothed or not
  


