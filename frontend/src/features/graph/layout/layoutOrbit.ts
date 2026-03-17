import type { GraphNodeBase } from '@/features/graph/types';

// ── Public types ──────────────────────────────────────────────────────────────

type OrbitLayoutParams = {
    nodes: GraphNodeBase[];
    rootIds: string[];
    // childrenByParent is already filtered to visible nodes by buildVisibleHierarchy —
    // no further expansion checks are needed inside this layout.
    childrenByParent: Map<string, string[]>;
    actNodes?: GraphNodeBase[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

export const ORBIT_CENTER_X = 980;
export const ORBIT_CENTER_Y = 720;

// Topic root nodes sit on this ring
const TOPIC_RING_RADIUS = 480;

// Each additional depth level extends outward by this amount
const CHILD_DEPTH_GAP = 230;

// Small gap (radians) between adjacent topic sectors
const SECTOR_GAP = 0.05;

// Horizontal spacing between act nodes clustered near center
const ACT_SPACING_X = 140;
const ACT_SPACING_Y = 100;

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Orbit layout:
 *   - Act nodes: small grid cluster at the canvas center
 *   - Topic root nodes: arranged on an outer ring (TOPIC_RING_RADIUS)
 *   - Children: each depth level spreads radially outward from the topic's angle
 *
 * `childrenByParent` must already be filtered to visible nodes (as provided by
 * buildVisibleHierarchy). This layout does not re-check expansion state.
 */
export function layoutOrbit({
    nodes,
    rootIds,
    childrenByParent,
    actNodes = [],
}: OrbitLayoutParams): GraphNodeBase[] {
    const persistedPositions = placePersistedNodes({ rootIds, childrenByParent });
    const actPositions = placeActNodesAtCenter(actNodes);

    const allNodes = [...nodes, ...actNodes];
    return allNodes.map((node) => {
        const pos =
            persistedPositions.get(node.id) ??
            actPositions.get(node.id) ??
            node.position;
        return { ...node, position: pos };
    });
}

// ── Persisted node placement ──────────────────────────────────────────────────

function placePersistedNodes({
    rootIds,
    childrenByParent,
}: {
    rootIds: string[];
    childrenByParent: Map<string, string[]>;
}): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    if (rootIds.length === 0) return positions;

    // Subtree sizes drive proportional angular allocation per topic
    const subtreeSizeById = computeSubtreeSizes(rootIds, childrenByParent);
    const totalWeight = rootIds.reduce((s, id) => s + (subtreeSizeById.get(id) ?? 1), 0);

    const totalGap = SECTOR_GAP * rootIds.length;
    const totalAngle = Math.PI * 2 - totalGap;

    let cursor = -Math.PI / 2;
    for (const rootId of rootIds) {
        const weight = subtreeSizeById.get(rootId) ?? 1;
        const sectorAngle = totalAngle * (weight / Math.max(totalWeight, 1));
        const midAngle = cursor + sectorAngle / 2;

        positions.set(rootId, polarToCartesian(TOPIC_RING_RADIUS, midAngle));

        placeChildren({
            parentId: rootId,
            startAngle: cursor,
            endAngle: cursor + sectorAngle,
            depth: 1,
            positions,
            childrenByParent,
            subtreeSizeById,
        });

        cursor += sectorAngle + SECTOR_GAP;
    }

    return positions;
}

function placeChildren({
    parentId,
    startAngle,
    endAngle,
    depth,
    positions,
    childrenByParent,
    subtreeSizeById,
}: {
    parentId: string;
    startAngle: number;
    endAngle: number;
    depth: number;
    positions: Map<string, { x: number; y: number }>;
    childrenByParent: Map<string, string[]>;
    subtreeSizeById: Map<string, number>;
}) {
    const children = childrenByParent.get(parentId) ?? [];
    if (children.length === 0) return;

    const radius = TOPIC_RING_RADIUS + depth * CHILD_DEPTH_GAP;
    const span = endAngle - startAngle;
    const totalChildWeight = children.reduce((s, id) => s + (subtreeSizeById.get(id) ?? 1), 0);

    let cursor = startAngle;
    for (const childId of children) {
        const weight = subtreeSizeById.get(childId) ?? 1;
        const childSector = span * (weight / Math.max(totalChildWeight, 1));
        const midAngle = cursor + childSector / 2;

        positions.set(childId, polarToCartesian(radius, midAngle));

        placeChildren({
            parentId: childId,
            startAngle: cursor,
            endAngle: cursor + childSector,
            depth: depth + 1,
            positions,
            childrenByParent,
            subtreeSizeById,
        });

        cursor += childSector;
    }
}

// ── Act node placement ────────────────────────────────────────────────────────

/**
 * Place act nodes in a compact grid near the canvas center.
 * Up to 3 per row, centered horizontally.
 */
function placeActNodesAtCenter(
    actNodes: GraphNodeBase[],
): Map<string, { x: number; y: number }> {
    const result = new Map<string, { x: number; y: number }>();
    const n = actNodes.length;
    if (n === 0) return result;

    const cols = Math.min(n, 3);
    actNodes.forEach((node, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const rowCount = Math.min(cols, n - row * cols);
        // Center each row horizontally
        const offsetX = (col - (rowCount - 1) / 2) * ACT_SPACING_X;
        const offsetY = row * ACT_SPACING_Y;
        result.set(node.id, {
            x: ORBIT_CENTER_X + offsetX,
            y: ORBIT_CENTER_Y + offsetY,
        });
    });

    return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function polarToCartesian(radius: number, angle: number) {
    return {
        x: ORBIT_CENTER_X + Math.cos(angle) * radius,
        y: ORBIT_CENTER_Y + Math.sin(angle) * radius,
    };
}

/**
 * Count total subtree size for each node using childrenByParent.
 * Since childrenByParent is already filtered to visible nodes, no expansion
 * check is needed — all listed children should be placed.
 */
function computeSubtreeSizes(
    rootIds: string[],
    childrenByParent: Map<string, string[]>,
): Map<string, number> {
    const memo = new Map<string, number>();

    const count = (nodeId: string): number => {
        const cached = memo.get(nodeId);
        if (cached !== undefined) return cached;
        const children = childrenByParent.get(nodeId) ?? [];
        const size = 1 + children.reduce((s, id) => s + count(id), 0);
        memo.set(nodeId, size);
        return size;
    };

    rootIds.forEach((id) => count(id));
    return memo;
}
