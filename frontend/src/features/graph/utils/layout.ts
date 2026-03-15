import { Node, Edge, Position } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled';
import {
    GRAPH_NODE_COLLAPSED_WIDTH,
    GRAPH_NODE_LAYOUT_HEIGHT,
    getLayoutDimensionsForNodeType,
} from '../constants/nodeDimensions';

const elk = new ELK();
const nodePaddingX = 40;
const nodePaddingY = 32;

type PreviousLayout = {
    nodes: Node[];
};

function getNodeDimensions(node: Node) {
    const measuredWidth = typeof node.measured?.width === 'number' ? node.measured.width : undefined;
    const measuredHeight = typeof node.measured?.height === 'number' ? node.measured.height : undefined;

    if (measuredWidth && measuredHeight) {
        return { width: measuredWidth, height: measuredHeight };
    }

    const layoutDimensions = getLayoutDimensionsForNodeType(node.type);
    return {
        width: layoutDimensions.width ?? GRAPH_NODE_COLLAPSED_WIDTH,
        height: layoutDimensions.height ?? GRAPH_NODE_LAYOUT_HEIGHT,
    };
}

function collectMovableNodeIds(nodes: Node[], edges: Edge[], previousById: Map<string, Node>) {
    const newNodeIds = new Set(nodes.filter((node) => !previousById.has(node.id)).map((node) => node.id));
    const movableNodeIds = new Set(newNodeIds);

    if (newNodeIds.size === 0) {
        return movableNodeIds;
    }

    edges.forEach((edge) => {
        if (newNodeIds.has(edge.source) || newNodeIds.has(edge.target)) {
            movableNodeIds.add(edge.source);
            movableNodeIds.add(edge.target);
        }
    });

    edges.forEach((edge) => {
        if (movableNodeIds.has(edge.source) || movableNodeIds.has(edge.target)) {
            movableNodeIds.add(edge.source);
            movableNodeIds.add(edge.target);
        }
    });

    return movableNodeIds;
}

function overlaps(left: Node, right: Node) {
    const leftDimensions = getNodeDimensions(left);
    const rightDimensions = getNodeDimensions(right);

    return !(
        left.position.x + leftDimensions.width + nodePaddingX <= right.position.x ||
        right.position.x + rightDimensions.width + nodePaddingX <= left.position.x ||
        left.position.y + leftDimensions.height + nodePaddingY <= right.position.y ||
        right.position.y + rightDimensions.height + nodePaddingY <= left.position.y
    );
}

function resolveOverlaps(nodes: Node[], movableNodeIds: Set<string>) {
    const resolvedNodes = [...nodes].sort((left, right) => {
        if (left.position.y !== right.position.y) {
            return left.position.y - right.position.y;
        }
        return left.position.x - right.position.x;
    });

    for (let index = 0; index < resolvedNodes.length; index += 1) {
        const currentNode = resolvedNodes[index];
        const isMovable = movableNodeIds.has(currentNode.id) && !currentNode.data?.isManualPosition;
        if (!isMovable) {
            continue;
        }

        for (let compareIndex = 0; compareIndex < index; compareIndex += 1) {
            const comparedNode = resolvedNodes[compareIndex];
            if (!overlaps(currentNode, comparedNode)) {
                continue;
            }

            currentNode.position = {
                x: comparedNode.position.x + getNodeDimensions(comparedNode).width + nodePaddingX,
                y: currentNode.position.y,
            };
        }
    }

    return nodes.map((node) => resolvedNodes.find((resolvedNode) => resolvedNode.id === node.id) ?? node);
}

export async function getLayoutedElements(
    nodes: Node[],
    edges: Edge[],
    direction = 'TB',
    previousLayout?: PreviousLayout,
): Promise<{ nodes: Node[], edges: Edge[] }> {
    const isHorizontal = direction === 'LR';
    const previousById = new Map(previousLayout?.nodes.map((node) => [node.id, node]) ?? []);
    const movableNodeIds = collectMovableNodeIds(nodes, edges, previousById);

    const graph = {
        id: 'root',
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': direction === 'TB' ? 'DOWN' : 'RIGHT',
            'elk.layered.spacing.nodeNodeBetweenLayers': '60',
            'elk.spacing.nodeNode': '40',
        },
        children: nodes.map((node) => {
            const dimensions = getNodeDimensions(node);
            return {
                id: node.id,
                width: dimensions.width,
                height: dimensions.height,
            };
        }),
        edges: edges.map((edge) => ({
            id: edge.id,
            sources: [edge.source],
            targets: [edge.target],
        })),
    };

    try {
        const layoutedGraph = await elk.layout(graph);

        const newNodes = nodes.map((node) => {
            const layoutedNode = layoutedGraph.children?.find((n) => n.id === node.id);
            const previousNode = previousById.get(node.id);
            const shouldKeepExistingPosition = (
                Boolean(node.data && node.data.isManualPosition)
                || (Boolean(previousNode) && !movableNodeIds.has(node.id))
            );

            const targetPosition = isHorizontal ? Position.Left : Position.Top;
            const sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

            return {
                ...node,
                targetPosition,
                sourcePosition,
                position: {
                    x: shouldKeepExistingPosition
                        ? previousNode?.position.x ?? node.position.x
                        : layoutedNode?.x ?? node.position.x,
                    y: shouldKeepExistingPosition
                        ? previousNode?.position.y ?? node.position.y
                        : layoutedNode?.y ?? node.position.y,
                },
            };
        });

        return { nodes: resolveOverlaps(newNodes, movableNodeIds), edges };
    } catch (e) {
        console.error("ELK layout failed", e);
        return { nodes, edges };
    }
}
