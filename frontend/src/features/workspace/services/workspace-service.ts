import {
    doc,
    onSnapshot,
    type DocumentData,
} from "firebase/firestore";

import { config } from "@/lib/config";
import { firestore } from "@/services/firebase/firestore";
import { getFirebaseIdToken } from "@/services/firebase/token";

export interface WorkspaceData {
    id: string;
    name: string;
    visibility: 'public' | 'private';
    createdBy?: string;
}

function workspaceDoc(workspaceId: string) {
    return doc(firestore, `workspaces/${workspaceId}`);
}

function readString(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() ? value : fallback;
}

function toWorkspaceData(workspaceId: string, data: DocumentData): WorkspaceData {
    const rawVisibility = data.visibility;
    return {
        id: workspaceId,
        name: readString(data.name, workspaceId),
        visibility: rawVisibility === 'public' ? 'public' : 'private',
        createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
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

    async updateVisibility(workspaceId: string, visibility: 'public' | 'private') {
        const idToken = await getFirebaseIdToken();
        if (!idToken) {
            throw new Error("authentication required");
        }

        const response = await fetch(`${config.actApiBaseUrl}/api/workspace/visibility`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
                workspace_id: workspaceId,
                visibility,
            }),
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || "failed to update workspace visibility");
        }
    },

    async updateWorkspaceName(workspaceId: string, newName: string) {
        const trimmedName = newName.trim();
        if (!trimmedName) {
            throw new Error("workspace name is required");
        }

        const idToken = await getFirebaseIdToken();
        if (!idToken) {
            throw new Error("authentication required");
        }

        const response = await fetch(`${config.actApiBaseUrl}/api/workspace/rename`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
                workspace_id: workspaceId,
                name: trimmedName,
            }),
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || "failed to rename workspace");
        }
    },
};
