---
name: geometry-pipeline
description: Reference for how Shades builds geometry - globules (level/silhouette sweep), projections (polyhedra draped on a surface), SuperGlobule, band flattening, and tiled-pattern mapping onto quads. Use when changing generation, flattening, or pattern-mapping code, or when reasoning about bands, facets, tubes, or partners.
---

# Geometry Generation Pipeline

The complete pipeline: `3D Geometry Generation → Flattened Bands → Pattern Application → SVG Output`

## Core Data Structures

- **Facets**: Triangles (the atomic geometric unit)
- **Bands**: Strips/groups of connected facets
  - Both generation methods (Globules and Projections) converge on the Bands type
  - Bands are the fundamental structure for flattening and pattern mapping

## Two Generation Methods

**1. Globules** - Still actively useful for certain outputs

Globules create 3D volumes via parametric sweep (like a pottery wheel profile with independent control).

**Components:**

- **Levels**: 2D cross-sections (points arranged radially around a center)
  - Generated from bezier curves with radial geometry
  - Defines the profile shape

- **Silhouettes**: 2D bezier curves controlling 3D extrusion
  - Y-axis → Z-axis position (vertical height in 3D space)
  - X-axis → Scale multiplier for the level
  - Can apply offsets (translation) and rotations

**Process:**

1. Sample points along the silhouette curve
2. For each sample point:
   - Y value determines Z position in 3D
   - X value provides scale factor for the level
   - Apply transformations (scale, offset, rotation)
3. Place transformed level at each Z height
4. Connect levels vertically to form 3D volume
5. Result: Parametric sweep with independent scale/offset/rotation control per level

**Characteristics:**

- Limited shape variety but mathematically precise
- Perfect for cylindrical/rotational forms
- Efficient computation

**2. Projections** - More flexible, wider shape variety

Projections "drape" polyhedron edge structures onto arbitrary 3D surfaces.

**Components:**

- **Polyhedra**: Organized 3D vectors forming polygons
  - Generated from configs in `src/lib/projection-geometry/generate-polyhedra.ts`
  - Define "edge curves" using bezier curves
  - Provide structural topology (pattern of connections)

- **Surface**: Any Three.js mesh
  - Currently supported: sphere, capsule, globule
  - Vision: support arbitrary 3D shapes
  - Provides overall form/shape

- **Cross Sections**: Bezier curve configs defining tube profiles
  - Applied at intersection points
  - Create "tubes" composed of bands

**Process:**

1. Start from a central point
2. Sample points from polyhedra edge curves (beziers)
3. Cast rays from center through sampled points
4. Rays transformed by polyhedra structure
5. Find intersections with surface mesh (ray tracing)
6. At each intersection point, apply cross-section shapes perpendicular to ray
7. Cross-sections create interconnected "tubes" (band structures)
8. Result: Network of tubes following polyhedron topology, conforming to surface shape

**Key Insight:**

- Polyhedra provides **structure/topology** (how elements connect)
- Surface provides **overall form** (what shape the structure conforms to)
- You're draping the polyhedron's edge network onto the surface

**Integration:** Projections can use globules as the surface mesh for ray tracing.

**3. SuperGlobule** - Container type

- Can hold both globules and projections
- Original vision: combine multiple elements for complex composite shapes
- Not fully realized yet
- Legacy code exists for combining multiple globules via transformations (not actively maintained)

## Flattening Process

Converts 3D bands to 2D while preserving intrinsic geometry (isometric transformation).

**Algorithm:**

1. For each 3D triangle in band:
   - Measure side lengths and vertex angles from 3D coordinates

2. Reconstruct in 2D preserving measurements:
   - Start with initial vector (or reuse previous triangle's last side for continuity)
   - Apply first side length
   - Rotate by vertex angle
   - Apply second side length
   - Result: 3 2D points forming flattened triangle

3. Chain triangles together:
   - Last side of triangle N becomes starting side of triangle N+1
   - Maintains continuity throughout band

4. Continue until entire band is flattened

5. Final transform: orient bands with long axis aligned to Y-dimension

**Characteristics:**

- Isometric (preserves lengths and angles)
- Like "unrolling" a paper strip
- Maintains geometric continuity between adjacent triangles
- No stretching or distortion

## Pattern System (Cut Patterns Only)

Applies repeating decorative patterns to flattened geometry.

**Core Types:**

- **Unit Pattern**: Series of points defining a repeating design element
- **PathSegment**: Maps directly to SVG path `d` attribute syntax
  - M = move, L = line, C = cubic bezier, etc.

**Mapping Process:**

1. **Decompose bands into quadrilaterals:**
   - Triangle 1: points A, B, C
   - Triangle 2: points B, C, D (shares edge B-C with Triangle 1)
   - Quadrilateral: 4 unique points (A, B, C, D) from pair of adjacent triangles
   - Each quad = fundamental unit for pattern mapping

2. **Map unit pattern to each quadrilateral:**
   - Algorithm transforms/deforms unit pattern to fit specific quad shape
   - Different pattern types available:
     - hex, grid, box (geometric tiles)
     - carnation, pinwheel, shield, tristar (decorative)
   - Each in `src/lib/patterns/tiled-[name]-pattern.ts`

3. **Integration adjustments:**
   - Some patterns apply adjustments for better visual continuity with adjacent patterns
   - Adjacent patterns can be in:
     - Same band
     - Different bands
     - Different tubes (for projections)

4. **Facet metadata for continuity:**
   - Each facet stores "partners" information
   - Partners = adjacent/neighboring facets
   - Used to ensure pattern continuity across boundaries
   - Enables seamless transitions between mapped patterns

**Note:** Different patterns developed at different times with varying sophistication. See individual pattern files for implementation details.

**Pattern Registry:** All patterns registered in `src/lib/patterns/pattern-definitions.ts`
