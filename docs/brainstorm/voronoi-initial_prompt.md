use superpower brainstorming do develop a spec for a new feature - Voronoi resampling
  
  This new feature is a sibling to `projection`
  
  Projection uses a a polyhedra with edge curves to raycast from a centerpoint and find intersection points on a surface mesh.  Those points are used to develop
  a set of sections that are used to define 3d facets forming bands and tubes.
  
  Voronoi resampling will take the same type of surface mesh, and will output the same types of 3d structures (bands, tubes, sections), but will use an 
  alternate method for choosing the equivalent of intersection points.
  
  We will use a voronoi tesselation algorithm.
  
  The basic idea of such an algorithm is:
  
  1) apply a set of points to the surface. Each point is co-planar with a facet of the surface, and is equivalent to an intersection point.  Points might be randomly distributed in some way, or picked / edited by the user.  We'll start a center-based raycaseter / intersection approach with random vector directions.
  2) Flatten the 3d mesh or use the mesh's UV coordinates and run an optimized planar voronoi generator library, like `d3-delaney` to generate the voronoi boundary lines.
  3) convert the voronoi boundaries back into 3d space, (or rather derive the 3d vectors that describe the voronoi lines mappeed over the 3d mesh).  Sample those 3d paths, similar to how we sample projection surface intersections based on the edge divisions.
  4) from this point on, we can return to the existing `projection` or `surfaceProjection` pipeline


What we want to brainstorm:

- new configs and config types
- new editors for the configs
- how rendering pipeline controls
- what 3rd party libraries can be leveraged
- flesh out the algorithms and expected behaviors