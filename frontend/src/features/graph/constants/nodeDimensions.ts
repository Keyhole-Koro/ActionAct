export const GRAPH_NODE_COLLAPSED_WIDTH = 340;
export const GRAPH_NODE_EXPANDED_WIDTH = 520;
export const GRAPH_NODE_LAYOUT_HEIGHT = 180;
export const GRAPH_NODE_EXPANDED_MAX_HEIGHT = 288;
export const GRAPH_NODE_EXPANDED_LAYOUT_HEIGHT = GRAPH_NODE_LAYOUT_HEIGHT + GRAPH_NODE_EXPANDED_MAX_HEIGHT;

export const GRAPH_ACT_NODE_COLLAPSED_WIDTH = 264;
export const GRAPH_ACT_NODE_EXPANDED_WIDTH = 392;
export const GRAPH_ACT_NODE_HEIGHT = 116;
export const GRAPH_ACT_NODE_EXPANED_MAX_HEIGHT = 220;
export const GRAPH_ACT_NODE_EXPANDED_LAYOUT_HEIGHT = GRAPH_ACT_NODE_HEIGHT + GRAPH_ACT_NODE_EXPANED_MAX_HEIGHT;

export const SELECTION_HEADER_WIDTH = 420;
export const SELECTION_HEADER_HEIGHT = 220;
export const SELECTION_NODE_WIDTH = 260;
export const SELECTION_NODE_HEIGHT = 160;

export const ACT_NODE_COMPACT_WIDTH = 148;
export const ACT_NODE_GROWTH_PER_CHAR = 7;
export const ACT_NODE_GROWTH_PADDING = 36;
export const NODE_COLLAPSED_BASE_WIDTH = 120;
export const NODE_COLLAPSED_GROWTH_PER_CHAR = 6;
export const NODE_COLLAPSED_PADDING = 24;

export function getCollapsedNodeWidth(label: string | undefined, nodeKind?: string, hasChildNodes = false) {
    const currentTitle = (label ?? '').trim();
    const minWidth = nodeKind === 'act' ? ACT_NODE_COMPACT_WIDTH : NODE_COLLAPSED_BASE_WIDTH;
    const maxWidth = nodeKind === 'act' ? GRAPH_ACT_NODE_COLLAPSED_WIDTH : GRAPH_NODE_COLLAPSED_WIDTH;
    const padding = hasChildNodes
        ? (nodeKind === 'act' ? NODE_COLLAPSED_PADDING + 18 : NODE_COLLAPSED_PADDING + 20)
        : NODE_COLLAPSED_PADDING;

    return Math.min(
        maxWidth,
        Math.max(
            minWidth,
            minWidth + (currentTitle.length * NODE_COLLAPSED_GROWTH_PER_CHAR) + padding,
        ),
    );
}

export function getExpandedNodeWidth(label: string | undefined, nodeKind?: string) {
    if (nodeKind === 'act') {
        const currentTitle = (label ?? '').trim();
        return Math.min(
            GRAPH_ACT_NODE_EXPANDED_WIDTH,
            Math.max(
                ACT_NODE_COMPACT_WIDTH,
                ACT_NODE_COMPACT_WIDTH + (currentTitle.length * ACT_NODE_GROWTH_PER_CHAR) + ACT_NODE_GROWTH_PADDING,
            ),
        );
    }

    return GRAPH_NODE_EXPANDED_WIDTH;
}

export function getLayoutDimensionsForNodeType(nodeType?: string, isExpanded = false, nodeKind?: string) {
    if (nodeType === 'selectionHeader') {
        return { width: SELECTION_HEADER_WIDTH, height: SELECTION_HEADER_HEIGHT };
    }

    if (nodeType === 'selectionNode') {
        return { width: SELECTION_NODE_WIDTH, height: SELECTION_NODE_HEIGHT };
    }

    if (nodeKind === 'act') {
        return {
            width: isExpanded ? GRAPH_ACT_NODE_EXPANDED_WIDTH : GRAPH_ACT_NODE_COLLAPSED_WIDTH,
            height: isExpanded ? GRAPH_ACT_NODE_EXPANDED_LAYOUT_HEIGHT : GRAPH_ACT_NODE_HEIGHT,
        };
    }

    return {
        width: isExpanded ? GRAPH_NODE_EXPANDED_WIDTH : GRAPH_NODE_COLLAPSED_WIDTH,
        height: isExpanded ? GRAPH_NODE_EXPANDED_LAYOUT_HEIGHT : GRAPH_NODE_LAYOUT_HEIGHT,
    };
}
