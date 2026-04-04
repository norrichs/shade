# Fix: Globule Editing

## Agent instructions:
The primary goal of this work is to transition from legacy methods of specifying and editing Globule geometry to new methods, which are already partially implemented.
Legacy data structures, stores, and data-update methods will continue to be used.
This work focuses on UI data interpretion layers directly below UI.
Some feature descriptions are fiarly vague.  Ask for clarification before implementing or planning.  Getting my ideas correctly understood is of utmost importance.

## Description of needed work

### Globule cross section editor does not have have feature parity with the legacy `shape` editor

To be implemented, based on legacy examples:
- division input
- endpoint constraints (using new path editor constraint format)
- scale input (isn't working in old shape editor)
- sample method select dropdown
- handle constraints (follow endpoint, lock to partner)
- symmetry types picker (and implementation)
- add points to curve (button to enter "point placement" mode. Subsequent click on the curve will create a new point at that coordinates)
- remove points from curve (butotn to enter "point deletion" mode.  Subsequent click on a point will remove that point.  Points can be protected)
- radial shape mirroring

To be implemented (new):
- Assymmetric mode.  Enforce a set of curves with loop topology, but otherwise freeform

Relevant files:


### Silhouette editor does not have feature parity with the legacy 'silhouette' editor

To implement ()
