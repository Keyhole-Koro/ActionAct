import {
    doc,
    onSnapshot,
    updateDoc,
    serverTimestamp,
    type DocumentData,
} from "firebase/firestore";

import { firestore } from "@/services/firebase/firestore";

export interface WorkspaceData {
    id: string;
    name: string;
}

function workspaceDoc(workspaceId: string) {
    return doc(firestore, `workspaces/${workspaceId}`);
}

function readString(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() ? value : fallback;
}

function toWorkspaceData(workspaceId: string, data: DocumentData): WorkspaceData {
    return {
        id: workspaceId,
        name: readString(data.name, workspaceId),
    };
}

export const workspaceService = {
    subscribeWorkspace(
        workspaceId: string,
        callback: (workspace: WorkspaceData | null) => void,
    ) {
        const ref = workspaceDoc(workspaceId);

        return onSnapshot(
            ref,
            (snapshot) => {
                if (!snapshot.exists()) {
                    callback(null);
                    return;
                }

                const data = snapshot.data();
                callback(toWorkspaceData(snapshot.id, data));
            },
            (error) => {
                console.error("Workspace subscription failed:", error);
            },
        );
    },

    async updateWorkspaceName(workspaceId: string, newName: string) {
        const ref = workspaceDoc(workspaceId);
        await updateDoc(ref, {
            name: newName.trim(),
            updatedAt: serverTimestamp(),
        });
    },
};
