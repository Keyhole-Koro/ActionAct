import { Node, Edge, Position } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled';
import {
    GRAPH_NODE_LAYOUT_HEIGHT,
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '../constants/nodeDimensions';

const elk = new ELK();
const NODE_PADDING_X_MIN = 16;
const NODE_PADDING_X_MAX = 40;
const NODE_PADDING_Y_MIN = 14;
const NODE_PADDING_Y_MAX = 28;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

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

function getPairPadding(left: Node, right: Node) {
    const leftDimensions = getNodeDimensions(left);
    const rightDimensions = getNodeDimensions(right);
    return {
        x: clamp(
            Math.round((leftDimensions.width + rightDimensions.width) * 0.045),
            NODE_PADDING_X_MIN,
            NODE_PADDING_X_MAX,
        ),
        y: clamp(
            Math.round((leftDimensions.height + rightDimensions.height) * 0.05),
            NODE_PADDING_Y_MIN,
            NODE_PADDING_Y_MAX,
        ),
    };
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
    return !(endA <= startB || endB <= startA);
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
    const padding = getPairPadding(left, right);

    return !(
        left.position.x + leftDimensions.width + padding.x <= right.position.x ||
        right.position.x + rightDimensions.width + padding.x <= left.position.x ||
        left.position.y + leftDimensions.height + padding.y <= right.position.y ||
        right.position.y + rightDimensions.height + padding.y <= left.position.y
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

            const padding = getPairPadding(comparedNode, currentNode);

            if (direction === 'LR') {
                currentNode.position = {
                    x: currentNode.position.x,
                    y: comparedNode.position.y + getNodeDimensions(comparedNode).height + padding.y,
                };
                continue;
            }

            currentNode.position = {
                x: comparedNode.position.x + getNodeDimensions(comparedNode).width + padding.x,
                y: currentNode.position.y,
            };
        }
    }

    return nodes.map((node) => resolvedNodes.find((resolvedNode) => resolvedNode.id === node.id) ?? node);
}

function compactGaps(nodes: Node[], movableNodeIds: Set<string>, direction: 'TB' | 'LR') {
    const resolvedNodes = [...nodes].sort((left, right) => {
        if (direction === 'LR') {
            if (left.position.x !== right.position.x) {
                return left.position.x - right.position.x;
            }
            return left.position.y - right.position.y;
        }

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

        const currentDimensions = getNodeDimensions(currentNode);

        if (direction === 'LR') {
            let targetX = 0;
            for (let compareIndex = 0; compareIndex < index; compareIndex += 1) {
                const comparedNode = resolvedNodes[compareIndex];
                const comparedDimensions = getNodeDimensions(comparedNode);
                const padding = getPairPadding(comparedNode, currentNode);
                const verticalOverlap = rangesOverlap(
                    comparedNode.position.y - padding.y,
                    comparedNode.position.y + comparedDimensions.height + padding.y,
                    currentNode.position.y,
                    currentNode.position.y + currentDimensions.height,
                );
                if (!verticalOverlap) {
                    continue;
                }
                targetX = Math.max(
                    targetX,
                    comparedNode.position.x + comparedDimensions.width + padding.x,
                );
            }
            currentNode.position = {
                x: Math.max(targetX, 0),
                y: currentNode.position.y,
            };
            continue;
        }

        let targetY = 0;
        for (let compareIndex = 0; compareIndex < index; compareIndex += 1) {
            const comparedNode = resolvedNodes[compareIndex];
            const comparedDimensions = getNodeDimensions(comparedNode);
            const padding = getPairPadding(comparedNode, currentNode);
            const horizontalOverlap = rangesOverlap(
                comparedNode.position.x - padding.x,
                comparedNode.position.x + comparedDimensions.width + padding.x,
                currentNode.position.x,
                currentNode.position.x + currentDimensions.width,
            );
            if (!horizontalOverlap) {
                continue;
            }
            targetY = Math.max(
                targetY,
                comparedNode.position.y + comparedDimensions.height + padding.y,
            );
        }
        currentNode.position = {
            x: currentNode.position.x,
            y: Math.max(targetY, 0),
        };
    }

    return nodes.map((node) => resolvedNodes.find((resolvedNode) => resolvedNode.id === node.id) ?? node);
}

function getElkSpacing(nodes: Node[], direction: 'TB' | 'LR') {
    const dimensions = nodes.map((node) => getNodeDimensions(node));
    const averageWidth = dimensions.length > 0
        ? dimensions.reduce((sum, current) => sum + current.width, 0) / dimensions.length
        : 0;
    const averageHeight = dimensions.length > 0
        ? dimensions.reduce((sum, current) => sum + current.height, 0) / dimensions.length
        : 0;

    return {
        betweenLayers: direction === 'LR'
            ? clamp(Math.round(averageWidth * 0.12), 44, 88)
            : clamp(Math.round(averageHeight * 0.18), 32, 64),
        betweenSiblings: direction === 'LR'
            ? clamp(Math.round(averageHeight * 0.08), 18, 40)
            : clamp(Math.round(averageWidth * 0.05), 16, 36),
    };
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
    const spacing = getElkSpacing(nodes, direction);

    const graph = {
        id: 'root',
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': direction === 'TB' ? 'DOWN' : 'RIGHT',
            'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing.betweenLayers),
            'elk.spacing.nodeNode': String(spacing.betweenSiblings),
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

        const compactedNodes = compactGaps(newNodes, movableNodeIds, direction);
        return { nodes: resolveOverlaps(compactedNodes, movableNodeIds, direction), edges };
    } catch (e) {
        console.error("ELK layout failed", e);
        return { nodes, edges };
    }
}
