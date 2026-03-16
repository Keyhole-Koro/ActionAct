import type { Edge, Node } from '@xyflow/react';

import {
    SELECTION_HEADER_HEIGHT,
    SELECTION_HEADER_WIDTH,
    SELECTION_NODE_HEIGHT,
    SELECTION_NODE_WIDTH,
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '@/features/graph/constants/nodeDimensions';
import type { GraphNodeBase } from '@/features/graph/types';

import type { SelectionGroup, SelectionHeaderData, SelectionNodeData } from '../types';

type ProjectSelectionGroupsParams = {
    groups: SelectionGroup[];
    baseNodes: GraphNodeBase[];
    expandedNodeIds: string[];
    actions: {
        toggleOptionSelection: (groupId: string, optionId: string) => void;
        confirmSelection: (groupId: string) => void;
        clearSelection: (groupId: string) => void;
        cancelGroup: (groupId: string) => void;
    };
};

type SelectionProjection = {
    nodes: Array<Node<SelectionHeaderData | SelectionNodeData>>;
    edges: Edge[];
};

const ANCHORED_OFFSET_X = 240;
const CHOICE_LANE_OFFSET_X = 360;
const CHOICE_LANE_START_Y = 120;
const GROUP_GAP_Y = 44;
const HEADER_TO_OPTIONS_GAP_Y = 24;
const OPTION_GAP_X = 20;
const OPTION_GAP_Y = 20;

function parseCreationOrder(groupId: string) {
    const lastSegment = groupId.split('-').at(-1);
    const numeric = lastSegment ? Number(lastSegment) : Number.NaN;
    return Number.isFinite(numeric) ? numeric : 0;
}

function getNodeDimensions(node: GraphNodeBase, expandedSet: Set<string>) {
    const nodeData = (node.data ?? {}) as Record<string, unknown>;
    const nodeKind = typeof nodeData.kind === 'string' ? nodeData.kind : undefined;
    const label = typeof nodeData.label === 'string' ? nodeData.label : undefined;
    const isExpanded = expandedSet.has(node.id);
    const layoutDimensions = getLayoutDimensionsForNodeType(node.type, isExpanded, nodeKind);

    return {
        width: node.type === 'customTask'
            ? (isExpanded
                ? getExpandedNodeWidth(label, nodeKind)
                : getCollapsedNodeWidth(label, nodeKind, false))
            : layoutDimensions.width,
        height: layoutDimensions.height,
    };
}

function buildGroupGeometry(group: SelectionGroup, startX: number, startY: number, actions: ProjectSelectionGroupsParams['actions']) {
    const selectedCount = group.options.filter((option) => option.selected).length;
    const optionCount = group.options.length;
    const columnCount = optionCount === 1 ? 1 : 2;
    const rowCount = Math.ceil(optionCount / columnCount);
    const optionsTop = startY + SELECTION_HEADER_HEIGHT + HEADER_TO_OPTIONS_GAP_Y;
    const gridWidth = (columnCount * SELECTION_NODE_WIDTH) + ((columnCount - 1) * OPTION_GAP_X);
    const totalHeight = SELECTION_HEADER_HEIGHT
        + HEADER_TO_OPTIONS_GAP_Y
        + (rowCount * SELECTION_NODE_HEIGHT)
        + (Math.max(0, rowCount - 1) * OPTION_GAP_Y);

    const headerNode: Node<SelectionHeaderData> = {
        id: `${group.selection_group_id}-header`,
        type: 'selectionHeader',
        position: { x: startX, y: startY },
        draggable: false,
        selectable: false,
        zIndex: 150,
        data: {
            selection_group_id: group.selection_group_id,
            groupId: group.selection_group_id,
            title: group.title,
            instruction: group.instruction,
            selection_mode: group.selection_mode,
            status: group.status,
            options: group.options,
            selectedCount,
            optionCount,
            canConfirm: group.status === 'pending' && group.selection_mode === 'multiple' && selectedCount > 0,
            canClear: group.status === 'pending' && selectedCount > 0,
            canCancel: group.status === 'pending',
            expiresInMs: group.expires_in_ms ?? null,
            expiresAtTimestamp: group.expires_at_timestamp ?? null,
            onConfirm: () => actions.confirmSelection(group.selection_group_id),
            onClear: () => actions.clearSelection(group.selection_group_id),
            onCancel: () => actions.cancelGroup(group.selection_group_id),
        },
        style: { pointerEvents: 'all' },
    };

    const optionNodes: Array<Node<SelectionNodeData>> = group.options.map((option, index) => {
        const column = index % columnCount;
        const row = Math.floor(index / columnCount);
        return {
            id: `${group.selection_group_id}-option-${option.option_id}`,
            type: 'selectionNode',
            position: {
                x: startX + (column * (SELECTION_NODE_WIDTH + OPTION_GAP_X)),
                y: optionsTop + (row * (SELECTION_NODE_HEIGHT + OPTION_GAP_Y)),
            },
            draggable: false,
            selectable: false,
            zIndex: 145,
            data: {
                groupId: group.selection_group_id,
                optionId: option.option_id,
                label: option.label,
                reason: option.reason ?? null,
                contentMd: option.content_md ?? null,
                mode: group.selection_mode,
                status: group.status,
                isSelected: option.selected,
                isInteractive: group.status === 'pending',
                onSelect: () => actions.toggleOptionSelection(group.selection_group_id, option.option_id),
            },
            style: { pointerEvents: 'all' },
        };
    });

    const optionEdges: Edge[] = optionNodes.map((node) => ({
        id: `${group.selection_group_id}-header-link-${node.id}`,
        source: headerNode.id,
        target: node.id,
        type: 'smoothstep',
        animated: false,
        selectable: false,
        style: {
            stroke: '#d97706',
            strokeOpacity: 0.28,
            strokeWidth: 1.4,
            strokeDasharray: '5 4',
        },
    }));

    return {
        nodes: [headerNode, ...optionNodes],
        edges: optionEdges,
        width: Math.max(SELECTION_HEADER_WIDTH, gridWidth),
        height: totalHeight,
    };
}

export function projectSelectionGroups({ groups, baseNodes, expandedNodeIds, actions }: ProjectSelectionGroupsParams): SelectionProjection {
    if (groups.length === 0) {
        return { nodes: [], edges: [] };
    }

    const orderedGroups = [...groups].sort((left, right) => parseCreationOrder(left.selection_group_id) - parseCreationOrder(right.selection_group_id));
    const expandedSet = new Set(expandedNodeIds);
    const baseNodeById = new Map(baseNodes.map((node) => [node.id, node]));
    const maxBaseRight = baseNodes.reduce((max, node) => {
        const dimensions = getNodeDimensions(node, expandedSet);
        return Math.max(max, node.position.x + dimensions.width);
    }, 0);

    const anchoredBuckets = new Map<string, SelectionGroup[]>();
    const generalLaneGroups: SelectionGroup[] = [];

    orderedGroups.forEach((group) => {
        if (group.anchor_node_id && baseNodeById.has(group.anchor_node_id)) {
            const bucket = anchoredBuckets.get(group.anchor_node_id) ?? [];
            bucket.push(group);
            anchoredBuckets.set(group.anchor_node_id, bucket);
            return;
        }
        generalLaneGroups.push(group);
    });

    const nodes: Array<Node<SelectionHeaderData | SelectionNodeData>> = [];
    const edges: Edge[] = [];

    anchoredBuckets.forEach((bucket, anchorNodeId) => {
        const anchorNode = baseNodeById.get(anchorNodeId);
        if (!anchorNode) {
            return;
        }
        const anchorDimensions = getNodeDimensions(anchorNode, expandedSet);
        const startX = anchorNode.position.x + anchorDimensions.width + ANCHORED_OFFSET_X;
        let currentY = anchorNode.position.y;

        bucket.forEach((group) => {
            const geometry = buildGroupGeometry(group, startX, currentY, actions);
            nodes.push(...geometry.nodes);
            edges.push(...geometry.edges);
            edges.push({
                id: `${group.selection_group_id}-anchor-link`,
                source: anchorNode.id,
                target: `${group.selection_group_id}-header`,
                type: 'smoothstep',
                animated: false,
                selectable: false,
                style: {
                    stroke: '#b45309',
                    strokeOpacity: 0.4,
                    strokeWidth: 1.6,
                    strokeDasharray: '8 5',
                },
            });
            currentY += geometry.height + GROUP_GAP_Y;
        });
    });

    let currentChoiceY = CHOICE_LANE_START_Y;
    const choiceLaneX = maxBaseRight + CHOICE_LANE_OFFSET_X;
    generalLaneGroups.forEach((group) => {
        const geometry = buildGroupGeometry(group, choiceLaneX, currentChoiceY, actions);
        nodes.push(...geometry.nodes);
        edges.push(...geometry.edges);
        currentChoiceY += geometry.height + GROUP_GAP_Y;
    });

    return { nodes, edges };
}