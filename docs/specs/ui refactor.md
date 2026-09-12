the UI currently has a mix of config editor modules rendered as overlayed floating editors and editors rendered within a fixed pane

the fixed pane will be removed. Some editors shall be refactored to render in a floating editor. Some will be eliminated - removed entirely. Some will be disabled orphaned as dead code.

#### Editors to work on:

Silhouette - refactor.
Depth - refactor
Spine - disable
Shape - refactor
Projection - eliminate
Levels - refactor
Struts - disable
Cut - eliminate
Pattern - refactor
Super - disable

#### Document the orphaned editors with comments in their source files

#### Deleted editors can have their code removed

#### Refactored editors

General refactoring strategy -
Phase 1: copy. Make new versions of editors while old versions remain functional
Phase 2: test and iterate. Manual testing will find the places where copying was unsuccessful in achieving feature parity and we will fix issues
Phase 3: disable. Eliminate the current fixed pane interface for accessing legacy editors
Phase 4: clean up - remove dead code

Guidelines for refactoring

- feature parity is required
- drag and drop svg interfaces are delicate and must remain functional in their new environment. We have a new version of the PathEditor, with new design and functionality patterns. Use it instead of old drag and drop PathEditor
- other UI elements should be updated to use UI elements currently in use in floating editors
- layout patterns should be revised to use common floating editor layout patterns
- wiring to stores and effects must be reproduced

#### Reuse of existing floating editor versions

Some fixed pane editors already have Floating Editor analogues. Generally these are incomplete and lack feature parity. Use the new versions as a starting point and build them up to have full parity.

Included in this category:
Silhouette. (combine Depth and Silhouette fixed panel versions into this single editor. Render 2 PathEditor sub-panes)
Globule Cross Section (is analogue to Shape)
Pattern View - is very incomplete analogue to `Pattern`
