export interface EvidenceRef {
    id: string;
    title: string;
    url?: string;
    snippet?: string;
}

export interface TopicNode {
    id: string;
    topicId?: string;
    title: string;
    kind?: string;
    createdBy?: 'user' | 'agent';
    parentId?: string;
    referencedNodeIds?: string[];

    // Detailed fields (often populated by A7 summary agent)
    contextSummary?: string;
    detailHtml?: string;
    contentMd?: string;
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
    resolutionMode?: string;
    resolvedTopicId?: string;
}

export interface OrganizePort {
    subscribeTree: (workspaceId: string, topicId: string, callback: (nodes: TopicNode[]) => void) => () => void;
    subscribeNodeEvidence: (workspaceId: string, topicId: string, nodeId: string, callback: (evidenceRefs: EvidenceRef[]) => void) => () => void;
    subscribeInputProgress: (workspaceId: string, topicId: string, inputId: string, callback: (progress: InputProgress | null) => void) => () => void;

    // Mutating actions
    renameNode: (workspaceId: string, topicId: string, nodeId: string, newTitle: string) => Promise<void>;
    deleteNode: (workspaceId: string, topicId: string, nodeId: string) => Promise<void>;
    moveNode: (workspaceId: string, topicId: string, nodeId: string, newParentId: string | null) => Promise<void>;

    // Upload
    uploadInput: (workspaceId: string, file: File) => Promise<{ inputId: string; topicId: string }>;
}
