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

### 3. Descendant set is computed lazily (on-demand BFS)

An earlier version precomputed `descendantSetById` — a full `Set<string>` for every node in the
graph, built upfront whenever `childrenByParent` changed.

The build step was O(n²) in the worst case:

```
buildDescendants(node) {
    children.forEach(child =>
        buildDescendants(child).forEach(id => descendants.add(id))  // copies entire child set
    )
}
```

For a linear chain of n nodes the root's set had n entries, its child n−1, and so on — total
work proportional to n².

The current implementation replaces that with a single BFS rooted at `hoveredNodeId`, run only
when hover actually occurs:

```typescript
const queue: string[] = [hoveredNodeId];
while (queue.length > 0) {
    const current = queue.pop()!;
    for (const childId of childrenByParent.get(current) ?? []) {
        if (!result.has(childId)) { result.add(childId); queue.push(childId); }
    }
}
```

Cost is O(subtree_size_of_hovered_node), typically much less than n. No precomputation at all
when nothing is hovered.

### 4. Force-canvas hover focus is throttled to one frame

The radial overview can drive the force canvas navigator through `onHoverNode`.

Without throttling, rapid segment hover caused repeated `ReactFlow.setCenter(...)` calls in the same visual burst.

The current implementation schedules hover-driven focus once per animation frame and drops duplicate node ids.

This keeps the same behavior from the user's point of view:

- hover in radial overview
- main force canvas follows

but removes redundant camera updates.

### 5. Inset overview renders less by default

The force-screen inset overview does not need to render the same amount of detail as the full radial view.

The current implementation enables `compactMode` for the inset:

- normal state renders only shallower node buttons
- deeper nodes appear when hover/focus gives them context
- non-focused deeper segment guides are skipped

This preserves the navigator role of the inset while reducing DOM and SVG churn.

### 6. Selected-node lookup uses a Set

The render loop previously called `selectedNodeIds.includes(segment.node.id)` for every segment —
O(selected_count) per segment per render.

The current implementation derives `selectedNodeIdSet` once per render from the prop array and uses
`selectedNodeIdSet.has(...)` (O(1)) throughout.

### 7. Sibling index resolved from forEach position

Inside `assignSegments`, the old code called `siblingIds.indexOf(nodeId)` on every iteration to
compute `normalizedOffset` and `rootHue`. That is an O(sibling_count) scan inside an already
O(sibling_count) loop, making the loop O(n²) for nodes with many siblings.

The current implementation reads the index directly from the `forEach` callback:

```typescript
weightedChildren.forEach(({ nodeId, weight }, siblingIndex) => { ... });
```

No extra scan needed.

## What Has Not Changed

These optimizations are intended to preserve behavior:

- radial hover still expands the same branch
- radial hover still moves the radial viewport
- radial hover still nudges the force canvas
- click / double-click semantics are unchanged

Only the internal computation strategy changed.

## Known Remaining Costs

The following work still scales with graph size:

- rebuilding the full `segments` array on every hover (7-step useMemo chain)
- rendering many SVG sector paths and positioned node buttons
- overview zoom changing the scaled canvas dimensions

These are acceptable for current sizes, but if the graph grows substantially further, likely next steps are:

1. split hover state from visibility state — `segments` angle assignments don't need to change on hover, only weights do; separating the two could avoid rebuilding the full array
2. virtualize or cap deep node button rendering in inset mode
3. simplify SVG detail for tiny non-focused segments

## Regression Guardrails

When changing `RadialOverview`, avoid reintroducing:

- repeated BFS/DFS calls inside `assignSegments()`
- per-node `.filter(...)` calls inside recursive subtree-size functions
- unthrottled `focusNode()` calls from hover
- `Array.includes` or `Array.indexOf` inside per-segment render loops (use Sets/Maps)
- accumulating descendant sets by copying child sets into parent sets (O(n²))

If interaction becomes laggy again, inspect those paths first.
