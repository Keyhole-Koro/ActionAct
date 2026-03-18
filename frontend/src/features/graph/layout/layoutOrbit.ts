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

type SectorInfo = { startAngle: number; endAngle: number; midAngle: number };

// ── Constants ─────────────────────────────────────────────────────────────────

export const ORBIT_CENTER_X = 980;
export const ORBIT_CENTER_Y = 720;

// Topic root nodes sit on this ring
const TOPIC_RING_RADIUS = 480;

// Act nodes routed to a topic sit on this inner ring (between center and topic ring)
const ACT_NEAR_TOPIC_RADIUS = 290;

// Each additional depth level extends outward by this amount
const CHILD_DEPTH_GAP = 230;

// Small gap (radians) between adjacent topic sectors
const SECTOR_GAP = 0.05;

// Max arc (radians) that act nodes for one topic may occupy within its sector
const ACT_SECTOR_MAX_SPREAD = Math.PI / 6; // 30°

// Spacing between act nodes in the center grid (unmatched)
const ACT_SPACING_X = 140;
const ACT_SPACING_Y = 100;

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Orbit layout:
 *   - Act nodes with a matching topicId: inner ring near their topic (r=290)
 *   - Act nodes with no topic match: compact grid at canvas center
 *   - Topic root nodes: outer ring (r=480), sectors proportional to subtree size
 *   - Children: spread radially outward per sector
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
    const { positions: persistedPositions, sectorByRootId } = placePersistedNodes({ rootIds, childrenByParent });
    const actPositions = placeActNodes(actNodes, sectorByRootId);

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
}): { positions: Map<string, { x: number; y: number }>; sectorByRootId: Map<string, SectorInfo> } {
    const positions = new Map<string, { x: number; y: number }>();
    const sectorByRootId = new Map<string, SectorInfo>();
    if (rootIds.length === 0) return { positions, sectorByRootId };

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
        sectorByRootId.set(rootId, { startAngle: cursor, endAngle: cursor + sectorAngle, midAngle });

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

    return { positions, sectorByRootId };
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
 * Route act nodes to their associated topic sector (inner ring, r=290), or to
 * the center grid if no matching topic is found.
 */
function placeActNodes(
    actNodes: GraphNodeBase[],
    sectorByRootId: Map<string, SectorInfo>,
): Map<string, { x: number; y: number }> {
    const result = new Map<string, { x: number; y: number }>();

    // Group act nodes by topicId
    const byTopic = new Map<string, GraphNodeBase[]>();
    const unmatched: GraphNodeBase[] = [];

    for (const node of actNodes) {
        const topicId = node.data.topicId;
        if (topicId && sectorByRootId.has(topicId)) {
            const group = byTopic.get(topicId) ?? [];
            group.push(node);
            byTopic.set(topicId, group);
        } else {
            unmatched.push(node);
        }
    }

    // Place matched act nodes on the inner ring within their topic's sector
    for (const [topicId, group] of byTopic) {
        const sector = sectorByRootId.get(topicId)!;
        const n = group.length;

        // Spread within a bounded arc centered on the sector midAngle
        const availableArc = Math.min(ACT_SECTOR_MAX_SPREAD, sector.endAngle - sector.startAngle * 0.8);
        const step = n === 1 ? 0 : availableArc / (n - 1);
        const arcStart = sector.midAngle - availableArc / 2;

        group.forEach((node, i) => {
            const angle = n === 1 ? sector.midAngle : arcStart + i * step;
            result.set(node.id, polarToCartesian(ACT_NEAR_TOPIC_RADIUS, angle));
        });
    }

    // Place unmatched act nodes in a compact grid at the canvas center
    const cols = Math.min(unmatched.length, 3);
    unmatched.forEach((node, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const rowCount = Math.min(cols, unmatched.length - row * cols);
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
