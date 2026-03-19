import {
    forceCollide,
    forceLink,
    forceManyBody,
    forceSimulation,
    forceX,
    forceY,
    type SimulationLinkDatum,
    type SimulationNodeDatum,
} from 'd3-force';

import type { GraphNodeBase } from '@/features/graph/types';
import {
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '@/features/graph/constants/nodeDimensions';
import type { WeightedRelationEdge } from '@/features/graph/model/relations';

// ── Public types (unchanged — callers are not affected) ───────────────────────

type PositionedPersistedNode = GraphNodeBase;

type ForceLayoutParams = {
    nodes: GraphNodeBase[];
    edges: WeightedRelationEdge[];
    depthById: Map<string, number>;
    rootIds: string[];
    expandedNodeIds: Set<string>;
    previousPositions?: Map<string, { x: number; y: number }>;
    childrenByParent: Map<string, string[]>;
    actNodes?: GraphNodeBase[];
    actEdges?: { id: string; source: string; target: string }[];
};

// ── Internal simulation types ─────────────────────────────────────────────────

interface SimNode extends SimulationNodeDatum {
    id: string;
    width: number;
    height: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
    distance: number;
    strength: number;
}

function makeUndirectedEdgeKey(source: string, target: string) {
    return source < target ? `${source}|${target}` : `${target}|${source}`;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PADDING = 120;
// Tick budgets per scenario
const TICKS_FRESH       = 160;   // Increased for better convergence
const TICKS_NEW_NODES   = 70;    // More time to settle new nodes quietly
const TICKS_RELAX       = 40;    // Double the relax time to dampen sudden movements
const TICKS_EXPAND_ONLY = 20;    // Slightly more for dimension changes

// Electrostatic repulsion — keeps nodes apart
const CHARGE_STRENGTH = -420;
// Limit repulsion range so distant unconnected topics don't affect each other
const CHARGE_DISTANCE_MAX = 600;
// Weak centering — prevents the graph from drifting off-screen
const CENTER_STRENGTH = 0.05;

// Edge parameters
const HIERARCHY_DISTANCE = 180;   // parent → child (tight cluster)
const HIERARCHY_STRENGTH  = 0.28;
const RELATION_DISTANCE   = 300;   // cross-node relation (looser)
const RELATION_STRENGTH   = 0.04;
const TOPIC_CHAIN_DISTANCE = 460;  // topic ↔ topic spine edge
const TOPIC_CHAIN_STRENGTH = 0.015;
const ACT_CONTEXT_DISTANCE = 220;  // act → referenced persisted node
const ACT_CONTEXT_STRENGTH = 0.22;

// ── Main export ───────────────────────────────────────────────────────────────

export function layoutPersistedForce({
    nodes,
    edges,
    expandedNodeIds,
    previousPositions,
    childrenByParent,
    actNodes = [],
    actEdges = [],
}: ForceLayoutParams): PositionedPersistedNode[] {
    const allNodes = [...nodes, ...actNodes];
    if (allNodes.length === 0) return [];

    const actNodeIds = new Set(actNodes.map((n) => n.id));
    const nodeById = new Map(allNodes.map((n) => [n.id, n]));

    // ── Build simulation nodes ────────────────────────────────────────────────
    const simNodes: SimNode[] = allNodes.map((node) => {
        const { width, height } = getNodeDimensions(node, expandedNodeIds.has(node.id));
        const seed = previousPositions?.get(node.id);

        // New nodes without a seed: start near their parent if possible,
        // otherwise scatter around the origin with jitter.
        const parentId = typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
        const parentSeed = parentId ? previousPositions?.get(parentId) : undefined;
        // Increase jitter to reduce explosive overlap forces
        const jitter = (amount: number) => (Math.random() - 0.5) * amount;
        const fallbackX = parentSeed ? parentSeed.x + jitter(160) : jitter(200);
        const fallbackY = parentSeed ? parentSeed.y + jitter(160) : jitter(200);

        return {
            id: node.id,
            x: seed?.x ?? fallbackX,
            y: seed?.y ?? fallbackY,
            width,
            height,
        };
    });

    const simNodeById = new Map(simNodes.map((n) => [n.id, n]));

    // ── Build simulation links ────────────────────────────────────────────────
    const simLinks: SimLink[] = edges
        .filter((e) => simNodeById.has(e.source) && simNodeById.has(e.target))
        .map((e): SimLink => ({
            source: e.source,
            target: e.target,
            distance: e.relationType === 'contains' ? HIERARCHY_DISTANCE : RELATION_DISTANCE,
            strength: e.relationType === 'contains' ? HIERARCHY_STRENGTH  : RELATION_STRENGTH,
        }));
    const linkedPairs = new Set(simLinks.map((link) => makeUndirectedEdgeKey(String(link.source), String(link.target))));

    // Add parent→child hierarchy edges that might not be in `edges`
    // (ensures subtree cohesion even when some edges aren't in visibleEdges)
    for (const [parentId, children] of childrenByParent.entries()) {
        if (!simNodeById.has(parentId)) continue;
        for (const childId of children) {
            if (!simNodeById.has(childId)) continue;
            const pairKey = makeUndirectedEdgeKey(parentId, childId);
            if (!linkedPairs.has(pairKey)) {
                linkedPairs.add(pairKey);
                simLinks.push({ source: parentId, target: childId, distance: HIERARCHY_DISTANCE, strength: HIERARCHY_STRENGTH });
            }
        }
    }

    // Act context edges — pull each act node toward its referenced persisted nodes
    for (const edge of actEdges) {
        if (simNodeById.has(edge.source) && simNodeById.has(edge.target)) {
            simLinks.push({ source: edge.source, target: edge.target, distance: ACT_CONTEXT_DISTANCE, strength: ACT_CONTEXT_STRENGTH });
        }
    }

    // Connect topic root nodes in a chain so multiple topics stay in the same
    // viewport and are visually positioned relative to each other.
    // Exclude act nodes from the chain.
    const topicRoots = nodes.filter((n) => {
        const kind = (n.data as Record<string, unknown>)?.kind;
        const parentId = (n.data as Record<string, unknown>)?.parentId;
        return !actNodeIds.has(n.id) && (kind === 'topic' || (!parentId && !childrenByParent.has(n.id)));
    });
    if (topicRoots.length > 1) {
        for (let i = 0; i < topicRoots.length - 1; i++) {
            simLinks.push({
                source: topicRoots[i].id,
                target: topicRoots[i + 1].id,
                distance: TOPIC_CHAIN_DISTANCE,
                strength: TOPIC_CHAIN_STRENGTH,
            });
        }
    }

    // ── Run simulation synchronously ─────────────────────────────────────────
    const simulation = (forceSimulation<SimNode>(simNodes) as any)
        .velocityDecay(0.45) // Higher decay = more friction, less jumping
        .force(
            'charge',
            forceManyBody<SimNode>()
                .strength(CHARGE_STRENGTH)
                .distanceMax(CHARGE_DISTANCE_MAX),
        )
        .force(
            'link',
            forceLink<SimNode, SimLink>(simLinks)
                .id((d) => d.id)
                .distance((l) => l.distance)
                .strength((l) => l.strength)
                .iterations(4), // More iterations for stable structure
        )
        .force(
            'collide',
            forceCollide<SimNode>((n) => Math.max(n.width, n.height) * 0.42 + 12)
                .iterations(4), // Fine-grained collision resolution
        )
        .force('x', forceX<SimNode>(0).strength(CENTER_STRENGTH))
        .force('y', forceY<SimNode>(0).strength(CENTER_STRENGTH))
        .stop();

    // ── Incremental tick strategy ─────────────────────────────────────────────
    const newNodeIds = new Set(
        simNodes.filter((n) => !previousPositions?.has(n.id)).map((n) => n.id),
    );

    // "Spread" positions are ones where nodes are not all piled at the same
    // point — indicates a previously computed layout rather than default zeros.
    const posValues = previousPositions ? [...previousPositions.values()] : [];
    const hasSpread = posValues.length > 1 &&
        posValues.some((p) => Math.abs(p.x - posValues[0].x) > 2 || Math.abs(p.y - posValues[0].y) > 2);

    if (!hasSpread) {
        // No real previous layout — run full simulation from scratch
        simulation.tick(TICKS_FRESH);
    } else if (newNodeIds.size > 0) {
        // Topology changed (branch expanded, new nodes appeared):
        //   Phase 1 — pin existing nodes so only new nodes move
        for (const n of simNodes) {
            if (!newNodeIds.has(n.id)) { n.fx = n.x; n.fy = n.y; }
        }
        simulation.tick(TICKS_NEW_NODES);

        //   Phase 2 — unpin everything for a short global relax
        for (const n of simNodes) { n.fx = null; n.fy = null; }
        simulation.tick(TICKS_RELAX);
    } else {
        // Same visible topology, only dimensions changed (node content expanded).
        // Positions are already good — brief pass just to resolve new overlaps.
        simulation.tick(TICKS_EXPAND_ONLY);
    }

    // ── Map back to graph nodes ───────────────────────────────────────────────
    const positioned = allNodes.map((node) => {
        const sim = simNodeById.get(node.id)!;
        return { ...node, position: { x: sim.x ?? 0, y: sim.y ?? 0 } };
    });

    return normalizePositions(positioned, nodeById);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNodeDimensions(node: GraphNodeBase, isExpanded: boolean) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const kind = typeof data.kind === 'string' ? data.kind : undefined;
    const label = typeof data.label === 'string' ? data.label : undefined;
    const layout = getLayoutDimensionsForNodeType(node.type, isExpanded, kind);
    return {
        width: node.type === 'customTask'
            ? (isExpanded ? getExpandedNodeWidth(label, kind) : getCollapsedNodeWidth(label, kind, false))
            : layout.width,
        height: layout.height,
    };
}

function normalizePositions(
    nodes: GraphNodeBase[],
    _nodeById: Map<string, GraphNodeBase>,
): GraphNodeBase[] {
    if (nodes.length === 0) return nodes;
    const minX = Math.min(...nodes.map((n) => n.position.x));
    const minY = Math.min(...nodes.map((n) => n.position.y));
    const ox = PADDING - minX;
    const oy = PADDING - minY;
    if (ox === 0 && oy === 0) return nodes;
    return nodes.map((n) => ({
        ...n,
        position: { x: n.position.x + ox, y: n.position.y + oy },
    }));
}
