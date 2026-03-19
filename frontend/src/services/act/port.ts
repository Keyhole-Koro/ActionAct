export interface PatchOp {
    type: 'upsert' | 'append_md' | 'text_delta' | 'remove';
    nodeId: string;
    data?: Partial<{
        label: string;
        kind: string;
        contentMd: string;
        seq: bigint;
        expectedOffset: number;
        thoughtMd: string;
        isThought: boolean;
        referencedNodeIds: string[];
        createdBy: 'user' | 'agent';
        actions: { label: string, execute: string }[];
        usedContextNodeIds: string[];
        usedSelectedNodeContexts: SelectedNodeContext[];
        usedTools: string[];
        usedSources: SourceRef[];
    }>;
}

export interface StreamResponse {
    patch: PatchOp;
}

export interface SelectedNodeContext {
    nodeId: string;
    label?: string;
    kind?: string;
    contextSummary?: string;
    contentMd?: string;
    thoughtMd?: string;
    detailHtml?: string;
}

export interface SourceRef {
    id: string;
    kind?: string;
    label?: string;
    uri?: string;
}

export interface StreamActOptions {
    enableGrounding?: boolean;
    anchorNodeId?: string;
    contextNodeIds?: string[];
    selectedNodeContexts?: SelectedNodeContext[];
    userMedia?: { mimeType: string; data: Uint8Array }[];
    requestId?: string;
    includeThoughts?: boolean;
    workspaceId?: string;
    topicId?: string;
    actType?: 'explore' | 'consult' | 'investigate';
    modelProfile?: 'flash' | 'deep_research';
}

export interface ActPort {
    streamAct: (
        query: string,
        onPatch: (patch: PatchOp) => void,
        onDone: () => void,
        onError: (err: Error) => void,
        options?: StreamActOptions
    ) => () => void; // returns a cancel function
}
