import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';

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
    const actPositions = placeActNodes(actNodes, sectorByRootId, persistedPositions);

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

interface ActSimNode extends SimulationNodeDatum {
    id: string;
    fx?: number | null;
    fy?: number | null;
}
interface ActSimLink extends SimulationLinkDatum<ActSimNode> {
    distance: number;
    strength: number;
}

/**
 * Place act nodes using a force simulation.
 * - Persisted nodes are fixed anchors; act nodes spring toward their referenced ones.
 * - Suggestion nodes spring toward their parent act node.
 * - Act nodes repel each other and resolve collisions.
 * - Seed positions come from the polar inner-ring so the result is near-deterministic.
 */
function placeActNodes(
    actNodes: GraphNodeBase[],
    sectorByRootId: Map<string, SectorInfo>,
    persistedPositions: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
    const result = new Map<string, { x: number; y: number }>();
    if (actNodes.length === 0) return result;

    // ── Seed positions ───────────────────────────────────────────────────────
    // Primary rule: seed each act node at the average position of its referenced
    // persisted nodes. This naturally places act nodes near what they reference —
    // outer nodes (depth ≥ 1) pull the act outward; root/topic nodes keep it inner.
    // Fallback: topicId sector inner-ring, or center if neither is available.
    const seedPositions = new Map<string, { x: number; y: number }>();

    // Precompute sector angles for topicId fallback
    const byTopic = new Map<string, GraphNodeBase[]>();
    for (const node of actNodes) {
        const topicId = node.data.topicId;
        if (topicId && sectorByRootId.has(topicId)) {
            const group = byTopic.get(topicId) ?? [];
            group.push(node);
            byTopic.set(topicId, group);
        }
    }
    const topicSeedByNodeId = new Map<string, { x: number; y: number }>();
    for (const [topicId, group] of byTopic) {
        const sector = sectorByRootId.get(topicId)!;
        const n = group.length;
        const availableArc = Math.min(ACT_SECTOR_MAX_SPREAD, sector.endAngle - sector.startAngle * 0.8);
        const step = n === 1 ? 0 : availableArc / (n - 1);
        const arcStart = sector.midAngle - availableArc / 2;
        group.forEach((node, i) => {
            const angle = n === 1 ? sector.midAngle : arcStart + i * step;
            topicSeedByNodeId.set(node.id, polarToCartesian(ACT_NEAR_TOPIC_RADIUS, angle));
        });
    }

    for (const node of actNodes) {
        // Average position of referenced persisted nodes
        const refs = Array.isArray(node.data.referencedNodeIds) ? node.data.referencedNodeIds as string[] : [];
        const refPositions = refs.map((id) => persistedPositions.get(id)).filter(Boolean) as { x: number; y: number }[];
        if (refPositions.length > 0) {
            const avgX = refPositions.reduce((s, p) => s + p.x, 0) / refPositions.length;
            const avgY = refPositions.reduce((s, p) => s + p.y, 0) / refPositions.length;
            seedPositions.set(node.id, { x: avgX, y: avgY });
        } else {
            // Fallback: topicId sector → inner ring, else center
            seedPositions.set(node.id, topicSeedByNodeId.get(node.id) ?? { x: ORBIT_CENTER_X, y: ORBIT_CENTER_Y });
        }
    }

    // ── Build simulation nodes ───────────────────────────────────────────────
    const actNodeIds = new Set(actNodes.map((n) => n.id));

    // Persisted anchor nodes (fixed)
    const anchorSimNodes: ActSimNode[] = [];
    for (const [id, pos] of persistedPositions) {
        anchorSimNodes.push({ id, x: pos.x, y: pos.y, fx: pos.x, fy: pos.y });
    }

    // Act sim nodes (free to move)
    const actSimNodes: ActSimNode[] = actNodes.map((node) => {
        const seed = seedPositions.get(node.id) ?? { x: ORBIT_CENTER_X, y: ORBIT_CENTER_Y };
        return { id: node.id, x: seed.x, y: seed.y };
    });

    const allSimNodes = [...anchorSimNodes, ...actSimNodes];
    const simNodeById = new Map(allSimNodes.map((n) => [n.id, n]));

    // ── Build links ──────────────────────────────────────────────────────────
    const links: ActSimLink[] = [];

    for (const node of actNodes) {
        // Spring to referenced persisted nodes
        const refs = Array.isArray(node.data.referencedNodeIds) ? node.data.referencedNodeIds as string[] : [];
        for (const refId of refs) {
            if (simNodeById.has(refId) && !actNodeIds.has(refId)) {
                links.push({ source: node.id, target: refId, distance: 200, strength: 0.3 });
            }
        }

        // Spring suggestion nodes to their parent act node
        const parentId = typeof node.data.parentId === 'string' ? node.data.parentId : undefined;
        if (parentId && simNodeById.has(parentId)) {
            links.push({ source: node.id, target: parentId, distance: 140, strength: 0.5 });
        }
    }

    // ── Run simulation ───────────────────────────────────────────────────────
    const actIdSet = new Set(actNodes.map((n) => n.id));
    const simulation = forceSimulation<ActSimNode>(allSimNodes)
        // Repulsion only between act nodes — anchors must not repel act nodes outward
        .force('charge', forceManyBody<ActSimNode>().strength((d) => actIdSet.has(d.id) ? -220 : 0).distanceMax(350))
        .force(
            'link',
            forceLink<ActSimNode, ActSimLink>(links)
                .id((d) => d.id)
                .distance((l) => l.distance)
                .strength((l) => l.strength),
        )
        .force('collide', forceCollide<ActSimNode>(60).iterations(3))
        .force('x', forceX<ActSimNode>(ORBIT_CENTER_X).strength(0.02))
        .force('y', forceY<ActSimNode>(ORBIT_CENTER_Y).strength(0.02))
        .stop();

    simulation.tick(60);

    for (const simNode of actSimNodes) {
        result.set(simNode.id, { x: simNode.x ?? ORBIT_CENTER_X, y: simNode.y ?? ORBIT_CENTER_Y });
    }

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
