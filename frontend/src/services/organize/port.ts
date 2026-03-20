export interface EvidenceRef {
    id: string;
    title: string;
    url?: string;
    snippet?: string;
}

export interface TopicNode {
    id: string;
    topicId?: string;
    inputId?: string;
    title: string;
    kind?: string;
    status?: 'running' | 'completed' | 'failed';
    agentRole?: 'search';
    createdBy?: 'user' | 'agent';
    authorUid?: string;
    parentId?: string;
    referencedNodeIds?: string[];
    isManualPosition?: boolean;
    positionX?: number;
    positionY?: number;

    // Detailed fields (often populated by A7 summary agent)
    contextSummary?: string;
    detailHtml?: string;
    contentMd?: string;
    thoughtMd?: string;
    evidenceRefs?: EvidenceRef[];
}

export type InputProgressStatus =
    | "uploaded"
    | "extracting"
    | "atomizing"
    | "resolving_topic"
    | "updating_draft"
    | "completed"
    | "failed";

export interface InputProgress {
    inputId: string;
    topicId: string;
    workspaceId: string;
    status: InputProgressStatus;
    currentPhase?: string;
    lastEventType?: string;
    traceId?: string;
    resolutionMode?: string;
    resolvedTopicId?: string;
    errorCode?: string;
    errorMessage?: string;
    createdAt?: number | null;
    updatedAt?: number | null;
    completedAt?: number | null;
}

export interface TopicActivityItem extends InputProgress {
    draftVersion?: number;
    draftSummary?: string;
    bundleId?: string;
    bundleSummary?: string;
    hasSchemaChange?: boolean;
    outlineVersion?: number;
    outlineSummary?: string;
    changedNodeCount?: number;
}

export type ReviewOpState = 'planned' | 'approved' | 'applied' | 'dismissed';

export interface ReviewOpItem {
    opId: string;
    topicId: string;
    workspaceId: string;
    title: string;
    opType: string;
    state: ReviewOpState;
    reason?: string;
    traceId?: string;
    sourceEventType?: string;
    nodeIds: string[];
    generation?: number;
    requiresHumanReview?: boolean;
    initiator?: string;
    createdAt?: number | null;
    updatedAt?: number | null;
}

export interface OrganizePort {
    subscribeTree: (workspaceId: string, callback: (nodes: TopicNode[]) => void) => () => void;
    subscribeNodeEvidence: (workspaceId: string, nodeId: string, callback: (evidenceRefs: EvidenceRef[]) => void) => () => void;
    subscribeInputProgress: (workspaceId: string, inputId: string, callback: (progress: InputProgress | null) => void) => () => void;
    subscribeTopicActivity: (workspaceId: string, callback: (items: TopicActivityItem[]) => void) => () => void;
    subscribeOrganizeOps: (workspaceId: string, callback: (items: ReviewOpItem[]) => void) => () => void;

    // Mutating actions
    renameNode: (workspaceId: string, nodeId: string, newTitle: string) => Promise<void>;
    deleteNode: (workspaceId: string, nodeId: string) => Promise<void>;
    moveNode: (workspaceId: string, nodeId: string, newParentId: string | null) => Promise<void>;
    updateNodeSummary: (workspaceId: string, nodeId: string, contextSummary: string) => Promise<void>;

    // Upload
    uploadInput: (workspaceId: string, file: File) => Promise<{ inputId: string; topicId: string }>;
}
