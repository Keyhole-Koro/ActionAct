import { Node, Edge, Position } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled';
import {
    GRAPH_NODE_LAYOUT_HEIGHT,
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '../constants/nodeDimensions';

const elk = new ELK();
const nodePaddingX = 40;
const nodePaddingY = 32;

type PreviousLayout = {
    nodes: Node[];
};

function getNodeDimensions(node: Node) {
    const measuredHeight = typeof node.measured?.height === 'number' ? node.measured.height : undefined;
    const label = typeof node.data?.label === 'string' ? node.data.label : undefined;
    const nodeKind = typeof node.data?.kind === 'string' ? node.data.kind : undefined;
    const isExpanded = node.data?.isExpanded === true;
    const hasChildNodes = node.data?.hasChildNodes === true;
    const layoutDimensions = getLayoutDimensionsForNodeType(node.type, isExpanded, nodeKind);
    return {
        width: node.type === 'customTask'
            ? (isExpanded ? getExpandedNodeWidth(label, nodeKind) : getCollapsedNodeWidth(label, nodeKind, hasChildNodes))
            : layoutDimensions.width,
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

function resolveOverlaps(nodes: Node[], movableNodeIds: Set<string>, direction: 'TB' | 'LR') {
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

            if (direction === 'LR') {
                currentNode.position = {
                    x: currentNode.position.x,
                    y: comparedNode.position.y + getNodeDimensions(comparedNode).height + nodePaddingY,
                };
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
    direction: 'TB' | 'LR' = 'TB',
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
            'elk.layered.spacing.nodeNodeBetweenLayers': direction === 'LR' ? '140' : '60',
            'elk.spacing.nodeNode': direction === 'LR' ? '72' : '40',
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
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

        return { nodes: resolveOverlaps(newNodes, movableNodeIds, direction), edges };
    } catch (e) {
        console.error("ELK layout failed", e);
        return { nodes, edges };
    }
}
