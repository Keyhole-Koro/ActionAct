# Graph / Radial Handoff

This document captures the current implementation state of the `force + radial` graph work so the next contributor can continue without rebuilding context from scratch.

## Current Shape

The graph now has two coordinated views:

- main `force` canvas
- `radial` view

`GraphCanvas` is the top-level coordinator for both.

## Files That Matter

Primary implementation files:

- [GraphCanvas.tsx](/home/unix/Action/ActionAct/frontend/src/features/graph/components/GraphCanvas.tsx)
- [RadialOverview.tsx](/home/unix/Action/ActionAct/frontend/src/features/graph/components/RadialOverview.tsx)
- [projectPersistedGraph.ts](/home/unix/Action/ActionAct/frontend/src/features/graph/selectors/projectPersistedGraph.ts)
- [layoutRadial.ts](/home/unix/Action/ActionAct/frontend/src/features/graph/layout/layoutRadial.ts)
- [persistedGraphMockHundred.ts](/home/unix/Action/ActionAct/frontend/src/features/graph/mocks/persistedGraphMockHundred.ts)
- [radial-overview-performance.md](/home/unix/Action/ActionAct/frontend/src/features/graph/docs/radial-overview-performance.md)

Related spec:

- [frontend-spec.md](/home/unix/Action/ActionAct/frontend/frontend-spec.md)

## Current UX

### Force mode

The default main canvas is still React Flow.

It has:

- persisted graph in force layout
- ACT overlay
- a `Force / Radial` mode switch in the top-right
- a radial inset overview in the bottom-right

The inset overview is intended as a navigator, not a full-detail duplicate.

### Radial mode

When `layout=radial`, `GraphCanvas` renders `RadialOverview` as the main surface instead of React Flow.

This is not a pure edge graph. It is a segment-based radial UI.

## Radial Model

The radial view is currently a recursive segment layout:

- each node owns an angular segment
- children are placed inside the parent segment
- depth determines ring
- hover enlarges the hovered branch modestly

Important detail:

- radial projection ignores force-style branch expansion and gets all persisted nodes through `projectPersistedGraph(..., 'radial')`

That fix lives in [projectPersistedGraph.ts](/home/unix/Action/ActionAct/frontend/src/features/graph/selectors/projectPersistedGraph.ts).

## Radial Inset vs Full Radial

These are intentionally different now.

### Full radial

`RadialOverview` with:

- full rendering
- deeper layers available
- zoom / pan / hover behavior intact

### Inset radial

`RadialOverview` with `compactMode`

This means:

- usually only shallower node buttons are shown
- deep nodes appear when hover/focus gives context
- deeper non-focused segment guides are skipped

The purpose is performance and readability inside the force-screen navigator.

## Mock Data

There are two historical mock sources:

1. old inline mock previously inside `GraphCanvas`
2. file-based mock in `mocks/`

The inline mock was removed from active use.

Current `graphMock=1` uses:

- [persistedGraphMockHundred.ts](/home/unix/Action/ActionAct/frontend/src/features/graph/mocks/persistedGraphMockHundred.ts)

This mock is roughly 100 nodes and is intended to stress:

- deeper rings
- segment hover behavior
- inset overview performance

If the mock seems unexpectedly small, check that `GraphCanvas` is still using the file-based mock and not a reintroduced inline mock.

## Known Performance Work Already Done

Implemented so far:

- ancestor checks use precomputed `ancestorSet`
- descendant lookup uses memoized `descendantSetById`
- visible child filtering is cached
- force-canvas hover focus is throttled to one frame
- inset overview uses `compactMode`

See:

- [radial-overview-performance.md](/home/unix/Action/ActionAct/frontend/src/features/graph/docs/radial-overview-performance.md)

## Known Remaining Costs

The main remaining expensive work is:

1. rebuilding all `segments` on hover
2. updating many SVG paths and node buttons in full radial mode
3. overview viewport animation plus main force focus running together

So if the next contributor needs more speed, the likely next steps are:

1. partial segment reuse instead of rebuilding the full tree on hover
2. further simplify non-focused segment rendering
3. cap text/detail more aggressively in inset mode
4. reduce force-focus sensitivity from overview hover if UX allows

## Important Behavioral Contracts

These are intentional and should not be changed casually:

- radial hover moves the radial viewport
- radial hover in the inset also nudges the force canvas
- click still selects/activates
- double-click still toggles branch
- full radial and inset radial are allowed to differ in density

## Recent Bug Fixes / Gotchas

### 1. Deep radial layers not appearing

Cause:

- radial inset was being fed force-filtered nodes

Fix:

- `GraphCanvas` now builds `radialOverviewGraph` separately with `layoutMode='radial'`

### 2. Node positions looked slightly off on the ring

Cause:

- segment, guide, label, and node center calculations were not fully centralized

Fix:

- `getSegmentMidAngle()` and `getSegmentCenterPoint()` are now shared helpers

### 3. Mock file not being respected

Cause:

- `GraphCanvas` still had an old inline mock helper

Fix:

- active mock now comes from `mocks/persistedGraphMockHundred.ts`

## What To Read First Next Time

If continuing this work, read in this order:

1. [graph-radial-handoff.md](/home/unix/Action/ActionAct/frontend/src/features/graph/docs/graph-radial-handoff.md)
2. [radial-overview-performance.md](/home/unix/Action/ActionAct/frontend/src/features/graph/docs/radial-overview-performance.md)
3. [GraphCanvas.tsx](/home/unix/Action/ActionAct/frontend/src/features/graph/components/GraphCanvas.tsx)
4. [RadialOverview.tsx](/home/unix/Action/ActionAct/frontend/src/features/graph/components/RadialOverview.tsx)

## Verification Status

Last known local verification:

- `cd ActionAct/frontend && npx tsc --noEmit --pretty false`

This passed after the latest radial/inset/compact/performance changes.
