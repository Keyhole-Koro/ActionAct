export interface PatchOp {
    type: 'upsert' | 'append_md' | 'remove';
    nodeId: string;
    data?: Partial<{ label: string; type: string; contentMd: string; actions: { label: string, execute: string }[] }>;
}

export interface StreamResponse {
    patch: PatchOp;
}

export interface ActPort {
    streamAct: (
        query: string,
        onPatch: (patch: PatchOp) => void,
        onDone: () => void,
        onError: (err: Error) => void
    ) => () => void; // returns a cancel function
}
