import type { GraphNodeBase } from '@/features/graph/types';
import {
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '@/features/graph/constants/nodeDimensions';

type ProjectActOverlayParams = {
    actNodes: GraphNodeBase[];
    persistedNodes: GraphNodeBase[];
    expandedNodeIds: string[];
};

// How far to the right of the anchor node Act nodes float
const ANCHOR_OFFSET_X = 180;
// Fallback X when there's no anchor (right of the whole persisted layout)
const GENERAL_OFFSET_X = 260;

// Mini force simulation parameters
const SPRING_K              = 0.15;   // attraction toward target
const REPULSION             = 12000;  // act ↔ act repulsion
const REPULSION_PERSISTED   = 4800;   // act ← persisted repulsion (weaker, one-way)
const DAMPING               = 0.60;
const ITERATIONS            = 80;

type SimNode = {
    id: string;
    x: number; y: number;
    vx: number; vy: number;
    w: number; h: number;
    tx: number; ty: number;   // target position
};

type ObstacleNode = {
    x: number; y: number;
    w: number; h: number;
};

export function projectActOverlay({
    actNodes,
    persistedNodes,
    expandedNodeIds,
}: ProjectActOverlayParams): GraphNodeBase[] {
    if (actNodes.length === 0) return [];

    const persistedById = new Map(persistedNodes.map((n) => [n.id, n]));
    const expandedSet   = new Set(expandedNodeIds);

    const maxPersistedRight = persistedNodes.reduce((max, n) => {
        const d = getNodeDimensions(n, expandedSet.has(n.id));
        return Math.max(max, n.position.x + d.width);
    }, 0);

    // Separate manually/previously positioned nodes from those that need placement
    const fixedNodes: GraphNodeBase[]   = [];
    const floatNodes: GraphNodeBase[]   = [];

    for (const node of actNodes) {
        if (node.data?.isManualPosition === true) {
            fixedNodes.push(node);
        } else {
            floatNodes.push(node);
        }
    }

    if (floatNodes.length === 0) return fixedNodes;

    // Build simulation nodes
    const simNodes: SimNode[] = floatNodes.map((node) => {
        const { width: w, height: h } = getNodeDimensions(node, expandedSet.has(node.id));

        // Compute target based on primary anchor
        const referencedIds: string[] = Array.isArray(node.data?.referencedNodeIds)
            ? (node.data.referencedNodeIds as unknown[]).filter((v): v is string => typeof v === 'string')
            : [];
        const anchor = referencedIds.map((id) => persistedById.get(id)).find(Boolean);

        let tx: number, ty: number;
        if (anchor) {
            const ad = getNodeDimensions(anchor, expandedSet.has(anchor.id));
            tx = anchor.position.x + ad.width + ANCHOR_OFFSET_X;
            ty = anchor.position.y + ad.height / 2;
        } else {
            tx = maxPersistedRight + GENERAL_OFFSET_X;
            ty = 200 + floatNodes.indexOf(node) * 60;
        }

        // Seed from previous position if already placed, else start at target
        const seedX = node.data?.overlayPositioned === true ? node.position.x : tx;
        const seedY = node.data?.overlayPositioned === true ? node.position.y : ty;

        return { id: node.id, x: seedX, y: seedY, vx: 0, vy: 0, w, h, tx, ty };
    });

    // Build fixed obstacles from persisted nodes
    const obstacles: ObstacleNode[] = persistedNodes.map((n) => {
        const d = getNodeDimensions(n, expandedSet.has(n.id));
        return { x: n.position.x, y: n.position.y, w: d.width, h: d.height };
    });

    // ── Mini force simulation ─────────────────────────────────────────────────
    for (let iter = 0; iter < ITERATIONS; iter++) {
        // Spring toward target
        for (const n of simNodes) {
            n.vx += (n.tx - n.x) * SPRING_K;
            n.vy += (n.ty - n.y) * SPRING_K;
        }

        // Repulsion between act nodes
        for (let i = 0; i < simNodes.length; i++) {
            for (let j = i + 1; j < simNodes.length; j++) {
                const a = simNodes[i], b = simNodes[j];
                const dx = a.x - b.x, dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                const minDist = (Math.max(a.w, a.h) + Math.max(b.w, b.h)) * 0.55 + 16;
                if (dist < minDist * 1.8) {
                    const mag = REPULSION / (dist * dist);
                    const nx = dx / dist, ny = dy / dist;
                    a.vx += nx * mag; a.vy += ny * mag;
                    b.vx -= nx * mag; b.vy -= ny * mag;
                }
            }
        }

        // One-way repulsion: persisted nodes push act nodes away (persisted nodes don't move)
        for (const act of simNodes) {
            for (const obs of obstacles) {
                // Use center-to-center distance
                const acx = act.x + act.w / 2, acy = act.y + act.h / 2;
                const ocx = obs.x + obs.w / 2, ocy = obs.y + obs.h / 2;
                const dx = acx - ocx, dy = acy - ocy;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                const minDist = (Math.max(act.w, act.h) + Math.max(obs.w, obs.h)) * 0.55 + 20;
                if (dist < minDist * 1.5) {
                    const mag = REPULSION_PERSISTED / (dist * dist);
                    const nx = dx / dist, ny = dy / dist;
                    act.vx += nx * mag;
                    act.vy += ny * mag;
                }
            }
        }

        // Integrate
        for (const n of simNodes) {
            n.vx *= DAMPING;
            n.vy *= DAMPING;
            n.x  += n.vx;
            n.y  += n.vy;
        }
    }

    // Map back to graph nodes
    const posById = new Map(simNodes.map((n) => [n.id, { x: n.x, y: n.y }]));

    const positionedFloat: GraphNodeBase[] = floatNodes.map((node) => {
        const pos = posById.get(node.id)!;
        return {
            ...node,
            position: pos,
            data: { ...node.data, overlayPositioned: true },
        };
    });

    return [...positionedFloat, ...fixedNodes];
}

function getNodeDimensions(node: GraphNodeBase, isExpanded: boolean) {
    const data    = (node.data ?? {}) as Record<string, unknown>;
    const kind    = typeof data.kind  === 'string' ? data.kind  : undefined;
    const label   = typeof data.label === 'string' ? data.label : undefined;
    const layout  = getLayoutDimensionsForNodeType(node.type, isExpanded, kind);
    return {
        width: node.type === 'customTask'
            ? (isExpanded ? getExpandedNodeWidth(label, kind) : getCollapsedNodeWidth(label, kind, false))
            : layout.width,
        height: layout.height,
    };
}
