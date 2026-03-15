export const GRAPH_NODE_COLLAPSED_WIDTH = 340;
export const GRAPH_NODE_EXPANDED_WIDTH = 520;
export const GRAPH_NODE_LAYOUT_HEIGHT = 180;
export const GRAPH_NODE_EXPANDED_MAX_HEIGHT = 288;
export const GRAPH_NODE_EXPANDED_LAYOUT_HEIGHT = GRAPH_NODE_LAYOUT_HEIGHT + GRAPH_NODE_EXPANDED_MAX_HEIGHT;

export const SELECTION_HEADER_WIDTH = 420;
export const SELECTION_HEADER_HEIGHT = 220;
export const SELECTION_NODE_WIDTH = 260;
export const SELECTION_NODE_HEIGHT = 160;

export function getLayoutDimensionsForNodeType(nodeType?: string, isExpanded = false) {
    if (nodeType === 'selectionHeader') {
        return { width: SELECTION_HEADER_WIDTH, height: SELECTION_HEADER_HEIGHT };
    }

    if (nodeType === 'selectionNode') {
        return { width: SELECTION_NODE_WIDTH, height: SELECTION_NODE_HEIGHT };
    }

    return {
        width: isExpanded ? GRAPH_NODE_EXPANDED_WIDTH : GRAPH_NODE_COLLAPSED_WIDTH,
        height: isExpanded ? GRAPH_NODE_EXPANDED_LAYOUT_HEIGHT : GRAPH_NODE_LAYOUT_HEIGHT,
    };
}
