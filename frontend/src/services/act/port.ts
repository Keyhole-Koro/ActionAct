export interface PatchOp {
    type: 'upsert' | 'append_md' | 'remove';
    nodeId: string;
    data?: Partial<{ label: string; kind: string; contentMd: string; referencedNodeIds: string[]; createdBy: 'user' | 'agent'; actions: { label: string, execute: string }[] }>;
}

export interface StreamResponse {
    patch: PatchOp;
}

export interface StreamActOptions {
    enableGrounding?: boolean;
    anchorNodeId?: string;
    contextNodeIds?: string[];
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
