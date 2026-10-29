"""Generate the Escher-style hexagonal tile basis as SVG.

The tile is a regular pointy-top hexagon whose six edges are replaced by three
free curves plus their 120 degree rotations:

  curve A  runs from vertex T  to junction P; rotated about T  it becomes T  -> S
  curve B  runs from vertex LR to junction S; rotated about LR it becomes LR -> Q
  curve C  runs from vertex LL to junction Q; rotated about LL it becomes LL -> P

T, LR and LL are 3-fold rotation centres, so every extension is the exact
rotated copy of an inclusion and the tile tessellates the plane. The traced
points come from the reference screenshot (image pixel coords) and are mapped
into the exact hexagon frame; points that sit on a hexagon edge are snapped to it.

Usage: python3 generate-escher-tile.py  (writes escher-tile.svg, escher-tiling.svg)
"""

import math
import os

R = 100.0  # hexagon circumradius in output units

# --- reference frame fitted to the screenshot ------------------------------
IMG_CENTER = (878.2, 949.2)
IMG_RADIUS = 534.0
IMG_ROTATION = math.radians(1.08)  # screenshot hexagon is rotated ~1 degree


def from_image(p):
    x, y = p[0] - IMG_CENTER[0], p[1] - IMG_CENTER[1]
    c, s = math.cos(-IMG_ROTATION), math.sin(-IMG_ROTATION)
    return ((x * c - y * s) * R / IMG_RADIUS, (x * s + y * c) * R / IMG_RADIUS)


# --- exact hexagon (SVG coords, y down, pointy top) -------------------------
def vertex(angle_deg):
    a = math.radians(angle_deg)
    return (R * math.cos(a), R * math.sin(a))


T, UR, LR, B, LL, UL = (vertex(a) for a in (-90, -30, 30, 90, 150, 210))
HEX = [T, UR, LR, B, LL, UL]


def rotate(p, center, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    x, y = p[0] - center[0], p[1] - center[1]
    return (center[0] + x * c - y * s, center[1] + x * s + y * c)


def snap(p, a, b):
    """Project p onto the line through hexagon edge a-b."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
    return (a[0] + t * dx, a[1] + t * dy)


# Rotation (degrees, SVG y-down) about each centre that carries the tile's
# edge on one side of the centre onto the edge on the other side.
ROT_T = -120   # UL side -> UR side
ROT_LR = -120  # UR side -> B side
ROT_LL = -120  # B side  -> UL side

# --- traced curves ----------------------------------------------------------
img = from_image

# Junction P on the UL-LL edge; S and Q follow from the rotations, so the
# three junctions are consistent by construction.
P = snap(img((422, 742)), UL, LL)
S = rotate(P, T, ROT_T)
Q = rotate(S, LR, ROT_LR)

curve_a = [
    T,
    img((827, 667)),
    img((770, 690)),
    snap(img((522, 620)), UL, T),
    img((498, 415)),
    img((443, 398)),
    img((320, 487)),
    img((375, 572)),
    img((410, 572)),
    P,
]
curve_b = [
    LR,
    img((1078, 1108)),
    img((1008, 1102)),
    img((1080, 952)),
    snap(img((1340, 1027)), UR, LR),
    img((1380, 870)),
    img((1450, 772)),
    S,
]
curve_c = [
    LL,
    img((458, 1048)),
    img((546, 1066)),
    img((566, 1168)),
    img((645, 1238)),
    img((668, 1310)),
    snap(img((653, 1357)), LL, B),
    img((540, 1530)),
    img((400, 1585)),
    img((600, 1630)),
    Q,
]


def rotated(curve, center, deg):
    return [rotate(p, center, deg) for p in curve]


# Clockwise (on screen) outline starting at T.
outline = (
    rotated(curve_a, T, ROT_T)            # T  -> S   (top-right side)
    + list(reversed(curve_b))[1:]         # S  -> LR  (right side)
    + rotated(curve_b, LR, ROT_LR)[1:]    # LR -> Q   (bottom-right side)
    + list(reversed(curve_c))[1:]         # Q  -> LL  (bottom-left side)
    + rotated(curve_c, LL, ROT_LL)[1:]    # LL -> P   (left side)
    + list(reversed(curve_a))[1:-1]       # P  -> T   (top-left side), closes on T
)


# --- checks -------------------------------------------------------------------
def area(poly):
    return 0.5 * sum(
        poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
        for i in range(len(poly))
    )


def segments_cross(p1, p2, p3, p4):
    def orient(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    d1, d2 = orient(p3, p4, p1), orient(p3, p4, p2)
    d3, d4 = orient(p1, p2, p3), orient(p1, p2, p4)
    return d1 * d2 < 0 and d3 * d4 < 0


def self_intersections(poly):
    n, hits = len(poly), []
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            if segments_cross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n]):
                hits.append((i, j))
    return hits


hex_area = abs(area(HEX))
tile_area = abs(area(outline))
crossings = self_intersections(outline)
closure = math.dist(rotate(Q, LL, ROT_LL), P)
print(f"hexagon area {hex_area:.6f}  tile area {tile_area:.6f}  diff {tile_area - hex_area:.2e}")
print(f"junction closure error {closure:.2e}")
print(f"self-intersections: {crossings or 'none'}")
print(f"vertices: {len(outline)}")


# --- SVG output ---------------------------------------------------------------
def fmt(p):
    return f"{p[0]:.4f},{p[1]:.4f}"


def path_d(poly):
    return "M " + " L ".join(fmt(p) for p in poly) + " Z"


def bounds(polys, pad):
    xs = [p[0] for poly in polys for p in poly]
    ys = [p[1] for poly in polys for p in poly]
    return (min(xs) - pad, min(ys) - pad, max(xs) - min(xs) + 2 * pad, max(ys) - min(ys) + 2 * pad)


here = os.path.dirname(os.path.abspath(__file__))

vb = bounds([outline, HEX], 10)
centers = "\n".join(
    f'    <circle cx="{c[0]:.4f}" cy="{c[1]:.4f}" r="3" />' for c in (T, LR, LL)
)
tile_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]:.2f} {vb[1]:.2f} {vb[2]:.2f} {vb[3]:.2f}" width="{vb[2] * 4:.0f}" height="{vb[3] * 4:.0f}">
  <!-- Reference regular hexagon, circumradius {R:g} -->
  <path id="hexagon" d="{path_d(HEX)}" fill="none" stroke="#bbb" stroke-width="0.5" stroke-dasharray="2 2" />
  <!-- Tile outline: three curves and their 120 degree rotations about T, LR, LL -->
  <path id="tile" d="{path_d(outline)}" fill="#f0a83c33" stroke="#222" stroke-width="0.8" stroke-linejoin="round" />
  <g id="rotation-centers" fill="#e05050">
{centers}
  </g>
</svg>
"""
with open(os.path.join(here, "escher-tile.svg"), "w") as f:
    f.write(tile_svg)


# Tiling preview: grow copies by rotating about each tile's own centres.
def compose(m, n):
    a, b, c, d, e, f = m
    a2, b2, c2, d2, e2, f2 = n
    return (a * a2 + b * d2, a * b2 + b * e2, a * c2 + b * f2 + c,
            d * a2 + e * d2, d * b2 + e * e2, d * c2 + e * f2 + f)


def rot_matrix(center, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    cx, cy = center
    return (c, -s, cx - c * cx + s * cy, s, c, cy - s * cx - c * cy)


def apply(m, p):
    return (m[0] * p[0] + m[1] * p[1] + m[2], m[3] * p[0] + m[4] * p[1] + m[5])


generators = [rot_matrix(c, d) for c in (T, LR, LL) for d in (120, -120)]
identity = (1, 0, 0, 0, 1, 0)
seen, frontier, tiles = set(), [identity], []
limit = 3.2 * R
while frontier:
    m = frontier.pop()
    key = tuple(round(v, 6) for v in m)
    if key in seen:
        continue
    seen.add(key)
    if math.dist(apply(m, (0, 0)), (0, 0)) > limit:
        continue
    tiles.append(m)
    frontier.extend(compose(m, g) for g in generators)

palette = ["#f0a83c", "#4c9be8", "#7bc96f"]
tile_paths = []
for m in tiles:
    # Colour by orientation so the three rotated copies read as distinct.
    angle = round(math.degrees(math.atan2(m[3], m[0]))) % 360
    colour = palette[{0: 0, 120: 1, 240: 2}[angle]]
    tile_paths.append(
        f'  <path d="{path_d([apply(m, p) for p in outline])}" fill="{colour}" stroke="#222" stroke-width="0.6" stroke-linejoin="round" />'
    )
tv = bounds([[apply(m, (0, 0))] for m in tiles], 1.4 * R)
tiling_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{tv[0]:.2f} {tv[1]:.2f} {tv[2]:.2f} {tv[3]:.2f}" width="{tv[2] * 2:.0f}" height="{tv[3] * 2:.0f}">
{chr(10).join(tile_paths)}
</svg>
"""
with open(os.path.join(here, "escher-tiling.svg"), "w") as f:
    f.write(tiling_svg)
print(f"tiling preview: {len(tiles)} tiles")
