import type { GraphNodeBase } from '@/features/graph/types';
import {
    GRAPH_ACT_NODE_HEIGHT,
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '@/features/graph/constants/nodeDimensions';

type ProjectActOverlayParams = {
    actNodes: GraphNodeBase[];
    persistedNodes: GraphNodeBase[];
    expandedNodeIds: string[];
};

// X distance from the rightmost persisted node to the root column (depth=0)
const GLOBAL_X_OFFSET = 220;
// Horizontal gap between depth levels (depth=0, depth=1, depth=2, …)
const COLUMN_GAP = 320;
const ATTACHED_ROOT_GAP = 180;
const AGENT_CHILD_GAP = 180;
// Vertical gap between sibling subtrees within a tree
const SIBLING_GAP = 24;
// Vertical gap between separate trees
const TREE_GAP = 48;

// Module-level cache: return the same array reference when the effective layout
// inputs haven't changed. This prevents downstream useMemo hooks from
// invalidating when persistedGraph.positionedNodes gets a new reference but
// identical values — which happens when deferredExpandedBranchNodeIds resolves
// at streaming end and triggers a redundant persistedGraph recomputation.
let _overlayCache: {
    actKey: string;
    maxPersistedRight: number;
    expandedKey: string;
    result: GraphNodeBase[];
} | null = null;

function buildActKey(actNodes: GraphNodeBase[]): string {
    return actNodes.map((n) => {
        const parentId = typeof n.data?.parentId === 'string' ? n.data.parentId : '';
        const refs = Array.isArray(n.data?.referencedNodeIds)
            ? (n.data.referencedNodeIds as unknown[]).filter((v): v is string => typeof v === 'string').join('+')
            : '';
        const manual = n.data?.isManualPosition === true
            ? `@${Math.round(n.position.x)},${Math.round(n.position.y)}`
            : '';
        return `${n.id}:${parentId}:${refs}${manual}`;
    }).join('|');
}

function isRenderableCoordinate(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 20000;
}

function isUserActRoot(node: GraphNodeBase): boolean {
    return node.data?.nodeSource === 'act'
        && node.data?.createdBy === 'user'
        && typeof node.data?.parentId !== 'string';
}

function getChildGap(child: GraphNodeBase): number {
    return child.data?.kind === 'agent_act' ? AGENT_CHILD_GAP : COLUMN_GAP;
}

export function projectActOverlay({
    actNodes,
    persistedNodes,
    expandedNodeIds,
}: ProjectActOverlayParams): GraphNodeBase[] {
    if (actNodes.length === 0) return [];

    const persistedById = new Map(persistedNodes.map((n) => [n.id, n]));
    const expandedSet = new Set(expandedNodeIds);

    const maxPersistedRight = persistedNodes.reduce((max, n) => {
        const d = getNodeDimensions(n, expandedSet.has(n.id));
        return Math.max(max, n.position.x + d.width);
    }, 0);

    // Cache check: if the effective layout inputs are unchanged, reuse the
    // previous result array. This keeps positionedActNodes referentially stable
    // when persistedGraph.positionedNodes gets a new reference but identical
    // values — avoiding spurious downstream useMemo invalidations.
    const actKey = buildActKey(actNodes);
    const expandedKey = expandedNodeIds.slice().sort().join(',');
    if (
        _overlayCache !== null
        && _overlayCache.actKey === actKey
        && _overlayCache.maxPersistedRight === maxPersistedRight
        && _overlayCache.expandedKey === expandedKey
    ) {
        return _overlayCache.result;
    }

    // Only user-created act roots own persistent coordinates.
    // Agent children and nested act nodes always participate in tree layout.
    const fixedNodes: GraphNodeBase[] = [];
    const floatNodes: GraphNodeBase[] = [];

    for (const node of actNodes) {
        if (isUserActRoot(node) && isRenderableCoordinate(node.position?.x) && isRenderableCoordinate(node.position?.y)) {
            fixedNodes.push(node);
        } else {
            floatNodes.push(node);
        }
    }

    if (floatNodes.length === 0) return fixedNodes;

    const floatIds = new Set(floatNodes.map((n) => n.id));
    const fixedById = new Map(fixedNodes.map((n) => [n.id, n]));
    const nodeById = new Map(floatNodes.map((n) => [n.id, n]));

    // Build parent→children map (only among float nodes)
    const childrenMap = new Map<string, string[]>();
    for (const node of floatNodes) {
        const parentId =
            typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
        if (parentId && floatIds.has(parentId)) {
            const arr = childrenMap.get(parentId) ?? [];
            arr.push(node.id);
            childrenMap.set(parentId, arr);
        }
    }

    // Roots: float nodes with no float-node parent.
    // This includes both free roots (no act parent) and attached roots (parent is a fixed node).
    const roots = floatNodes.filter((n) => {
        const parentId =
            typeof n.data?.parentId === 'string' ? n.data.parentId : undefined;
        return !parentId || !floatIds.has(parentId);
    });

    // ── Per-root base X ───────────────────────────────────────────────────────
    // Attached roots (parent is a fixed/manual node) anchor their X to the fixed
    // parent's right edge rather than the global baseX. This keeps agent subtrees
    // visually adjacent to the user-placed node that spawned them.
    const globalBaseX = maxPersistedRight + GLOBAL_X_OFFSET;
    const baseXPerRoot = new Map<string, number>();
    for (const root of roots) {
        const parentId = typeof root.data?.parentId === 'string' ? root.data.parentId : undefined;
        const fixedParent = parentId ? fixedById.get(parentId) : undefined;
        if (fixedParent) {
            const pd = getNodeDimensions(fixedParent, expandedSet.has(fixedParent.id));
            baseXPerRoot.set(root.id, fixedParent.position.x + pd.width + ATTACHED_ROOT_GAP);
        } else {
            baseXPerRoot.set(root.id, globalBaseX);
        }
    }

    // ── Depth assignment (BFS from each root, resets to 0 per tree) ──────────
    // X = baseXPerRoot[root] + depth * COLUMN_GAP — depth is independent per tree
    const depthMap = new Map<string, number>();
    const rootOfNode = new Map<string, string>(); // nodeId → its tree's root id

    for (const root of roots) {
        const queue = [root.id];
        depthMap.set(root.id, 0);
        rootOfNode.set(root.id, root.id);
        let qi = 0;
        while (qi < queue.length) {
            const nodeId = queue[qi++];
            const depth = depthMap.get(nodeId)!;
            for (const childId of childrenMap.get(nodeId) ?? []) {
                if (!depthMap.has(childId)) {
                    depthMap.set(childId, depth + 1);
                    rootOfNode.set(childId, root.id);
                    queue.push(childId);
                }
            }
        }
    }

    // ── Subtree height (post-order) ───────────────────────────────────────────
    // subtreeHeight(n) = max(ownHeight, sum(children subtreeHeights) + gaps)
    const subtreeHeightCache = new Map<string, number>();

    const subtreeHeight = (nodeId: string): number => {
        const cached = subtreeHeightCache.get(nodeId);
        if (cached !== undefined) return cached;
        const node = nodeById.get(nodeId);
        const own = node ? getNodeDimensions(node, expandedSet.has(nodeId)).height : GRAPH_ACT_NODE_HEIGHT;
        const children = childrenMap.get(nodeId) ?? [];
        if (children.length === 0) {
            subtreeHeightCache.set(nodeId, own);
            return own;
        }
        const childTotal = children.reduce((s, c) => s + subtreeHeight(c), 0)
            + SIBLING_GAP * (children.length - 1);
        const result = Math.max(own, childTotal);
        subtreeHeightCache.set(nodeId, result);
        return result;
    };

    for (const root of roots) subtreeHeight(root.id);

    // ── Y position (top-down): place children sequentially, center parent ─────
    const posYMap = new Map<string, number>();

    const assignY = (nodeId: string, subtreeTop: number): void => {
        const node = nodeById.get(nodeId);
        const own = node ? getNodeDimensions(node, expandedSet.has(nodeId)).height : GRAPH_ACT_NODE_HEIGHT;
        const children = childrenMap.get(nodeId) ?? [];

        if (children.length === 0) {
            posYMap.set(nodeId, subtreeTop);
            return;
        }

        // Place children sequentially from subtreeTop
        let cursor = subtreeTop;
        for (const childId of children) {
            assignY(childId, cursor);
            cursor += subtreeHeight(childId) + SIBLING_GAP;
        }

        // Center this node vertically within its children's combined span
        const firstChildY = posYMap.get(children[0])!;
        const lastChild = children[children.length - 1];
        const lastChildNode = nodeById.get(lastChild);
        const lastChildH = lastChildNode
            ? getNodeDimensions(lastChildNode, expandedSet.has(lastChild)).height
            : GRAPH_ACT_NODE_HEIGHT;
        const lastChildY = posYMap.get(lastChild)!;
        posYMap.set(nodeId, (firstChildY + lastChildY + lastChildH) / 2 - own / 2);
    };

    // ── Anchor Y per root ─────────────────────────────────────────────────────
    const anchorYPerRoot = new Map<string, number>();
    let fallbackY = 200;
    for (const root of roots) {
        // Attached root: anchor to fixed parent's vertical center
        const parentId = typeof root.data?.parentId === 'string' ? root.data.parentId : undefined;
        const fixedParent = parentId ? fixedById.get(parentId) : undefined;
        if (fixedParent) {
            const pd = getNodeDimensions(fixedParent, expandedSet.has(fixedParent.id));
            anchorYPerRoot.set(root.id, fixedParent.position.y + pd.height / 2);
            continue;
        }

        // Free root: anchor to referenced persisted node, or fallback
        const referencedIds: string[] = Array.isArray(root.data?.referencedNodeIds)
            ? (root.data.referencedNodeIds as unknown[]).filter(
                  (v): v is string => typeof v === 'string',
              )
            : [];
        const anchor = referencedIds.map((id) => persistedById.get(id)).find(Boolean);
        if (anchor) {
            const ad = getNodeDimensions(anchor, expandedSet.has(anchor.id));
            anchorYPerRoot.set(root.id, anchor.position.y + ad.height / 2);
        } else {
            anchorYPerRoot.set(root.id, fallbackY);
            fallbackY += subtreeHeight(root.id) + TREE_GAP;
        }
    }

    // ── Sort roots by anchor Y, then resolve overlaps ─────────────────────────
    const sortedRoots = [...roots].sort(
        (a, b) => (anchorYPerRoot.get(a.id) ?? 0) - (anchorYPerRoot.get(b.id) ?? 0),
    );

    // Ideal tree origin Y: root node's top-left so its center aligns with anchor
    const idealOriginY = (rootId: string): number => {
        const anchorY = anchorYPerRoot.get(rootId) ?? 200;
        const node = nodeById.get(rootId);
        const rootH = node ? getNodeDimensions(node, expandedSet.has(rootId)).height : GRAPH_ACT_NODE_HEIGHT;
        return anchorY - rootH / 2;
    };

    const treeOriginY = new Map<string, number>();
    for (const root of sortedRoots) treeOriginY.set(root.id, idealOriginY(root.id));

    // 3 iterations of forward+backward relaxation to resolve overlaps
    for (let iter = 0; iter < 3; iter++) {
        // Forward: push down if overlapping tree above
        let prevBottom = -Infinity;
        for (const root of sortedRoots) {
            const y = Math.max(treeOriginY.get(root.id)!, prevBottom + TREE_GAP);
            treeOriginY.set(root.id, y);
            prevBottom = y + subtreeHeight(root.id);
        }
        // Backward: pull toward ideal, constrained by tree below
        let nextTop = Infinity;
        for (let i = sortedRoots.length - 1; i >= 0; i--) {
            const root = sortedRoots[i];
            const maxAllowed = nextTop - TREE_GAP - subtreeHeight(root.id);
            treeOriginY.set(root.id, Math.min(idealOriginY(root.id), maxAllowed));
            nextTop = treeOriginY.get(root.id)!;
        }
    }
    // Final forward pass
    let finalPrevBottom = -Infinity;
    for (const root of sortedRoots) {
        const y = Math.max(treeOriginY.get(root.id)!, finalPrevBottom + TREE_GAP);
        treeOriginY.set(root.id, y);
        finalPrevBottom = y + subtreeHeight(root.id);
    }

    // ── Run assignY for each tree from its resolved origin ────────────────────
    for (const root of sortedRoots) {
        assignY(root.id, treeOriginY.get(root.id) ?? 0);
    }

    const posXMap = new Map<string, number>();
    const assignX = (nodeId: string): number => {
        const cached = posXMap.get(nodeId);
        if (cached !== undefined) {
            return cached;
        }

        const node = nodeById.get(nodeId);
        if (!node) {
            posXMap.set(nodeId, globalBaseX);
            return globalBaseX;
        }

        const parentId = typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
        if (parentId && floatIds.has(parentId)) {
            const parentX = assignX(parentId);
            const nextX = parentX + getChildGap(node);
            posXMap.set(nodeId, nextX);
            return nextX;
        }

        if (parentId) {
            const fixedParent = fixedById.get(parentId);
            if (fixedParent) {
                const fixedDimensions = getNodeDimensions(fixedParent, expandedSet.has(fixedParent.id));
                const nextX = fixedParent.position.x + fixedDimensions.width + getChildGap(node);
                posXMap.set(nodeId, nextX);
                return nextX;
            }
        }

        const rootId = rootOfNode.get(nodeId);
        const nextX = rootId != null ? (baseXPerRoot.get(rootId) ?? globalBaseX) : globalBaseX;
        posXMap.set(nodeId, nextX);
        return nextX;
    };

    // ── Emit positioned nodes ─────────────────────────────────────────────────
    const positionedFloat: GraphNodeBase[] = floatNodes.map((node) => {
        const preserveExistingPosition =
            isUserActRoot(node)
            && node.data?.overlayPositioned === true
            && isRenderableCoordinate(node.position?.x)
            && isRenderableCoordinate(node.position?.y);

        if (preserveExistingPosition) {
            return {
                ...node,
                data: { ...node.data, overlayPositioned: true },
            };
        }
        return {
            ...node,
            position: {
                x: assignX(node.id),
                y: posYMap.get(node.id) ?? 0,
            },
            data: { ...node.data, overlayPositioned: true },
        };
    });

    const result = [...fixedNodes, ...positionedFloat];
    _overlayCache = { actKey, maxPersistedRight, expandedKey, result };
    return result;
}

function getNodeDimensions(node: GraphNodeBase, isExpanded: boolean) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const kind = typeof data.kind === 'string' ? data.kind : undefined;
    const label = typeof data.label === 'string' ? data.label : undefined;
    const layout = getLayoutDimensionsForNodeType(node.type, isExpanded, kind);
    return {
        width:
            node.type === 'customTask'
                ? isExpanded
                    ? getExpandedNodeWidth(label, kind)
                    : getCollapsedNodeWidth(label, kind, false)
                : layout.width,
        height: layout.height,
    };
}
