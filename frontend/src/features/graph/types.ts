import type { Edge, Node } from '@xyflow/react';

import type { EvidenceRef } from '@/services/organize/port';
import type { SelectedNodeContext, SourceRef } from '@/services/act/port';

export type GraphNodeAction = {
    label: string;
    execute: string;
};

export type ReferencedNodeView = {
    id: string;
    label: string;
};

export type BaseNodeData = {
    nodeSource?: 'persisted' | 'act';
    createdBy?: 'user' | 'agent';
    topicId?: string;
    label: string;
    kind?: string;
    actions?: GraphNodeAction[];
    contentMd?: string;
    thoughtMd?: string;
    contextSummary?: string;
    detailHtml?: string;
    evidenceRefs?: EvidenceRef[];
    usedContextNodeIds?: string[];
    usedSelectedNodeContexts?: SelectedNodeContext[];
    usedTools?: string[];
    usedSources?: SourceRef[];
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

export type GraphNodeBaseData = PersistedNodeData | ActNodeData;

export type GraphNodeRenderData = GraphNodeBaseData & {
    layoutMode?: 'force' | 'radial';
    radialDepth?: number;
    actStage?: 'draft' | 'thinking' | 'ready';
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
    onAddMedia?: (file: File) => Promise<void> | void;
};

export type GraphNodeBase = Node<GraphNodeBaseData>;
export type GraphNodeRender = Node<GraphNodeRenderData>;
export type GraphEdge = Edge;
