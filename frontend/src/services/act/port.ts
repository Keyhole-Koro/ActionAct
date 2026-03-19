export interface PatchOp {
    type: 'upsert' | 'append_md' | 'text_delta' | 'remove';
    nodeId: string;
    data?: Partial<{
        label: string;
        kind: string;
        topicId: string;
        parentId: string;
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

export interface ActionTriggerPayload {
    action: string;      // "start_act"
    payloadJson: string; // JSON string of action args
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
    /** GCS references for files uploaded via /api/upload/presign. */
    userMediaRefs?: { mimeType: string; gcsObjectKey: string; sizeBytes: number }[];
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
        options?: StreamActOptions,
        onActionTrigger?: (trigger: ActionTriggerPayload) => void,
    ) => () => void; // returns a cancel function
}
