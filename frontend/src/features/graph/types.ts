import type { Edge, Node } from '@xyflow/react';

import type { EvidenceRef } from '@/services/organize/port';
import type { SelectionHeaderData, UiSelectionOption, SelectionMode, SelectionStatus } from '@/features/agentInteraction/types';

export type GraphNodeAction = {
    label: string;
    execute: string;
};

export type ReferencedNodeView = {
    id: string;
    label: string;
};

export type BaseNodeData = {
    topicId?: string;
    label: string;
    kind?: string;
    actions?: GraphNodeAction[];
    contentMd?: string;
    contextSummary?: string;
    detailHtml?: string;
    evidenceRefs?: EvidenceRef[];
    parentId?: string;
    referencedNodeIds?: string[];
    isManualPosition?: boolean;
};

export type PersistedNodeData = BaseNodeData & {
    parentId?: string;
};

export type ActNodeData = BaseNodeData & {
    kind: 'act';
};

export type SelectionHeaderNodeData = SelectionHeaderData;

export type SelectionOptionNodeData = UiSelectionOption & {
    groupId: string;
    selectionMode: SelectionMode;
    groupStatus: SelectionStatus;
};

export type GraphNodeBaseData = PersistedNodeData | ActNodeData;

export type GraphNodeRenderData = GraphNodeBaseData & {
    referencedNodes?: ReferencedNodeView[];
    hasChildNodes?: boolean;
    branchExpanded?: boolean;
    hiddenChildCount?: number;
    isExpanded?: boolean;
    isEditing?: boolean;
    isStreaming?: boolean;
    onToggleBranch?: () => void;
    onOpenDetails?: () => void;
    onOpenReferencedNode?: (nodeId: string) => void;
    onCommitLabel?: (label: string) => void;
    onRunAction?: (label: string) => void;
};

export type GraphNodeBase = Node<GraphNodeBaseData>;
export type GraphNodeRender = Node<GraphNodeRenderData>;
export type GraphEdge = Edge;
