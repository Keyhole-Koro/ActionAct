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

// Collision radius per node type (half approximate card width + padding)
const ACT_COLLISION_RADIUS = 110;
const PERSISTED_COLLISION_RADIUS = 75;

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Orbit layout:
 *   - Topic root nodes: outer ring (r=480), sectors proportional to subtree size
 *   - Children: spread radially outward per sector
 *   - Act nodes: force simulation, seeded near their referenced persisted nodes
 *
 * When act nodes are present, persisted nodes participate in the force simulation
 * with a strong home spring so they yield slightly to act-node collisions instead
 * of overlapping.
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
    const { positions: homePositions, sectorByRootId } = placePersistedNodes({ rootIds, childrenByParent });

    // No act nodes → use home positions directly, no simulation needed
    if (actNodes.length === 0) {
        return nodes.map((node) => ({
            ...node,
            position: homePositions.get(node.id) ?? node.position,
        }));
    }

    // Act nodes present → run combined simulation so persisted nodes can yield
    const finalPositions = runCombinedSimulation(actNodes, homePositions, sectorByRootId);

    const allNodes = [...nodes, ...actNodes];
    return allNodes.map((node) => ({
        ...node,
        position: finalPositions.get(node.id) ?? node.position,
    }));
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

// ── Combined force simulation ─────────────────────────────────────────────────

interface SimNode extends SimulationNodeDatum {
    id: string;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
    distance: number;
    strength: number;
}

/**
 * Run a unified force simulation over both persisted and act nodes.
 *
 * Persisted nodes are NOT fixed. Instead they have a strong forceX/Y pulling
 * them back to their computed home position (strength=0.8). This lets them
 * yield slightly when an act node collides with them, preventing overlap while
 * keeping the orbit ring structure intact.
 *
 * Act nodes repel each other, spring toward their referenced/parent nodes, and
 * have a weak pull toward the canvas center as fallback.
 */
function runCombinedSimulation(
    actNodes: GraphNodeBase[],
    homePositions: Map<string, { x: number; y: number }>,
    sectorByRootId: Map<string, SectorInfo>,
): Map<string, { x: number; y: number }> {
    const actIds = new Set(actNodes.map((n) => n.id));
    const persistedIds = new Set(homePositions.keys());

    // ── Seed act node positions ───────────────────────────────────────────────
    const actSeedPositions = computeActSeedPositions(actNodes, homePositions, sectorByRootId);

    // ── Build simulation nodes ────────────────────────────────────────────────
    const allSimNodes: SimNode[] = [
        // Persisted: start at home position, will be pulled back by forceX/Y
        ...[...homePositions.entries()].map(([id, pos]) => ({ id, x: pos.x, y: pos.y } as SimNode)),
        // Act: start at seed position
        ...actNodes.map((node) => {
            const seed = actSeedPositions.get(node.id) ?? { x: ORBIT_CENTER_X, y: ORBIT_CENTER_Y };
            return { id: node.id, x: seed.x, y: seed.y } as SimNode;
        }),
    ];

    const simNodeById = new Map(allSimNodes.map((n) => [n.id, n]));

    // ── Build links ───────────────────────────────────────────────────────────
    const links: SimLink[] = [];

    for (const node of actNodes) {
        // Spring toward referenced persisted nodes — strong enough to resist repulsion/collision drift
        const refs = Array.isArray(node.data.referencedNodeIds) ? node.data.referencedNodeIds as string[] : [];
        for (const refId of refs) {
            if (simNodeById.has(refId) && !actIds.has(refId)) {
                links.push({ source: node.id, target: refId, distance: 160, strength: 0.6 });
            }
        }

        // Suggestion nodes spring toward their parent act node
        const parentId = typeof node.data.parentId === 'string' ? node.data.parentId : undefined;
        if (parentId && simNodeById.has(parentId)) {
            links.push({ source: node.id, target: parentId, distance: 140, strength: 0.6 });
        }
    }

    // ── Run simulation ────────────────────────────────────────────────────────
    const simulation = forceSimulation<SimNode>(allSimNodes)
        // Repulsion only between act nodes — persisted nodes must not blast act nodes outward
        .force('charge', forceManyBody<SimNode>()
            .strength((d) => actIds.has(d.id) ? -220 : 0)
            .distanceMax(350))
        .force(
            'link',
            forceLink<SimNode, SimLink>(links)
                .id((d) => d.id)
                .distance((l) => l.distance)
                .strength((l) => l.strength),
        )
        // Per-node collision radius: act nodes are larger cards
        .force('collide', forceCollide<SimNode>((d) => actIds.has(d.id) ? ACT_COLLISION_RADIUS : PERSISTED_COLLISION_RADIUS).iterations(4))
        // Persisted nodes: strong home spring. Act nodes: weak center pull.
        .force('x', forceX<SimNode>((d) => homePositions.get(d.id)?.x ?? ORBIT_CENTER_X)
            .strength((d) => persistedIds.has(d.id) ? 0.8 : 0.02))
        .force('y', forceY<SimNode>((d) => homePositions.get(d.id)?.y ?? ORBIT_CENTER_Y)
            .strength((d) => persistedIds.has(d.id) ? 0.8 : 0.02))
        .stop();

    simulation.tick(80);

    const result = new Map<string, { x: number; y: number }>();
    for (const simNode of allSimNodes) {
        result.set(simNode.id, { x: simNode.x ?? ORBIT_CENTER_X, y: simNode.y ?? ORBIT_CENTER_Y });
    }
    return result;
}

/**
 * Compute seed (initial) positions for act nodes before the simulation runs.
 * Primary: average position of referenced persisted nodes.
 * Fallback: topicId sector inner ring → canvas center.
 */
function computeActSeedPositions(
    actNodes: GraphNodeBase[],
    persistedPositions: Map<string, { x: number; y: number }>,
    sectorByRootId: Map<string, SectorInfo>,
): Map<string, { x: number; y: number }> {
    // Precompute topic-sector seed positions for fallback
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

    const seeds = new Map<string, { x: number; y: number }>();
    for (const node of actNodes) {
        const refs = Array.isArray(node.data.referencedNodeIds) ? node.data.referencedNodeIds as string[] : [];
        const refPositions = refs.map((id) => persistedPositions.get(id)).filter(Boolean) as { x: number; y: number }[];
        if (refPositions.length > 0) {
            const avgX = refPositions.reduce((s, p) => s + p.x, 0) / refPositions.length;
            const avgY = refPositions.reduce((s, p) => s + p.y, 0) / refPositions.length;
            seeds.set(node.id, { x: avgX, y: avgY });
        } else {
            seeds.set(node.id, topicSeedByNodeId.get(node.id) ?? { x: ORBIT_CENTER_X, y: ORBIT_CENTER_Y });
        }
    }
    return seeds;
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
