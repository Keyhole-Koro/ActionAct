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
    type: string;
    parentId?: string;

    // Detailed fields (often populated by A7 summary agent)
    contextSummary?: string;
    detailHtml?: string;
    contentMd?: string;
    evidenceRefs?: EvidenceRef[];
}

export interface OrganizePort {
    subscribeTree: (workspaceId: string, topicId: string, callback: (nodes: TopicNode[]) => void) => () => void;

    // Mutating actions
    renameNode: (workspaceId: string, topicId: string, nodeId: string, newTitle: string) => Promise<void>;
    deleteNode: (workspaceId: string, topicId: string, nodeId: string) => Promise<void>;
    moveNode: (workspaceId: string, topicId: string, nodeId: string, newParentId: string | null) => Promise<void>;

    // Upload
    uploadInput: (workspaceId: string, topicId: string, file: File) => Promise<{ inputId: string }>;
}
