# Radial Overview Performance Notes

This note documents the current performance assumptions for `RadialOverview` and the optimizations that keep the force canvas + radial overview combination responsive with larger mock graphs.

## Current Hot Paths

The expensive path is hover.

When `hoveredNodeId` changes, the overview recalculates:

- `ancestorSet`
- `descendantSet`
- `visibleNodeIds`
- `subtreeSizeById`
- recursive `segments`
- internal viewport animation target
- optional force-canvas focus

This is expected, but the implementation should avoid repeating equivalent tree walks inside those steps.

## Applied Optimizations

### 1. Ancestor checks are precomputed

The old implementation called a subtree BFS for each sibling inside `assignSegments()`.

That path looked like:

- `assignSegments()`
- `isSameOrAncestor()`
- breadth-first search over descendants

This turned one hover into many repeated tree walks.

The current implementation replaces that with `ancestorSet.has(nodeId)`.
That preserves the same branch weighting behavior for the hovered branch, but removes the repeated descendant scans.

### 2. Visible-child filtering is cached

The old subtree-size logic filtered child arrays on every recursive call:

- `childrenByParent.get(nodeId)?.filter(visibleNodeIds.has)`

The current implementation builds `visibleChildrenByParent` once per hover state and reuses it while computing subtree sizes.

That reduces repeated array filtering in deep trees.

### 3. Descendants are memoized by node id

The old hover path rebuilt `descendantSet` by running a BFS from the hovered node every time hover changed.

The current implementation precomputes `descendantSetById` once for the current tree and then resolves hover by direct lookup.

That keeps the same visibility logic, but removes one complete tree walk from the hot hover path.

### 4. Force-canvas hover focus is throttled to one frame

The radial overview can drive the force canvas navigator through `onHoverNode`.

Without throttling, rapid segment hover caused repeated `ReactFlow.setCenter(...)` calls in the same visual burst.

The current implementation schedules hover-driven focus once per animation frame and drops duplicate node ids.

This keeps the same behavior from the user's point of view:

- hover in radial overview
- main force canvas follows

but removes redundant camera updates.

## What Has Not Changed

These optimizations are intended to preserve behavior:

- radial hover still expands the same branch
- radial hover still moves the radial viewport
- radial hover still nudges the force canvas
- click / double-click semantics are unchanged

Only the internal computation strategy changed.

## Known Remaining Costs

The following work still scales with graph size:

- recomputing `descendantSet` when hover changes
- rebuilding the full `segments` array on hover
- rendering many SVG sector paths and positioned node buttons
- overview zoom changing the scaled canvas dimensions

These are acceptable for current mock sizes, but if the graph grows substantially further, likely next steps are:

1. cache descendants by node id
2. split hover state from visibility state more aggressively
3. virtualize or cap deep node button rendering in inset mode
4. simplify SVG detail for tiny non-focused segments

## Regression Guardrails

When changing `RadialOverview`, avoid reintroducing:

- repeated BFS/DFS calls inside `assignSegments()`
- per-node `.filter(...)` calls inside recursive subtree-size functions
- unthrottled `focusNode()` calls from hover

If interaction becomes laggy again, inspect those three paths first.
