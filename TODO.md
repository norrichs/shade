## Wooden Globule Exports

### Dihedral angles

- Find the dihedral angle between half-planes representing facets.

  - calculate from

    - P (point on intersection line)
    - b0 (P + b0 is second point on intersection line)
    - b1 (P + b1 is point on facet1 opposite intersection line)
    - b2 (P + b2 is point on facet2 opposite intersection line)

    angle = acos(((b0 x b1) dot (b0 x b2)) / (|b0 x b1| \* |b0 x b2|))

  ```
  2 triangles

  t1 = (p0 , p1, p2)
  t2 = (p0, p1, p3)

  const P = new Vector3(p0)
  const b0 = new Vector3(p1).addScaledVector(-1, P)
  const b1 = new Vector3(p2).addScaledVector(-1, P)
  const b2 = new Vector3(p3).addScaledVector(-1, P)

  const cross1 = new Vector3()
  const cross2 = new Vector3()

  cross1.crossVectors(b0, b1)
  cross2.crossVectors(b0, b2)

  const angle = Math.acos(
    (cross1.dot(cross2)) /
    (cross1.length() * cross2.length())
  )
  ```
