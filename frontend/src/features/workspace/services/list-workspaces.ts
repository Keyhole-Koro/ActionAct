import { collectionGroup, getDocs, getDoc, query, where } from "firebase/firestore";

import { firestore } from "@/services/firebase/firestore";
import { type WorkspaceData } from "./workspace-service";

export async function listUserWorkspaces(uid: string): Promise<WorkspaceData[]> {
    const membersQuery = query(
        collectionGroup(firestore, "members"),
        where("uid", "==", uid),
    );

    let memberSnaps;
    try {
        memberSnaps = await getDocs(membersQuery);
    } catch (error) {
        console.error("listUserWorkspaces.membersQuery failed", {
            uid,
            message: error instanceof Error ? error.message : String(error),
        });
        throw new Error(`members query failed for uid=${uid}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const workspaces: WorkspaceData[] = [];

    for (const memberDoc of memberSnaps.docs) {
        const workspaceRef = memberDoc.ref.parent.parent;
        if (!workspaceRef) continue;

        let workspaceSnap;
        try {
            workspaceSnap = await getDoc(workspaceRef);
        } catch (error) {
            console.error("listUserWorkspaces.workspaceGet failed", {
                uid,
                workspacePath: workspaceRef.path,
                memberPath: memberDoc.ref.path,
                memberDocId: memberDoc.id,
                memberUid: memberDoc.data()?.uid,
                message: error instanceof Error ? error.message : String(error),
            });
            throw new Error(
                `workspace read failed for ${workspaceRef.path} via ${memberDoc.ref.path}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        if (!workspaceSnap.exists()) continue;

        const data = workspaceSnap.data();
        const updatedAt = data.updatedAt && typeof data.updatedAt.toMillis === "function"
            ? data.updatedAt.toMillis()
            : undefined;

        workspaces.push({
            id: workspaceSnap.id,
            name: typeof data.name === "string" && data.name.trim() ? data.name : workspaceSnap.id,
            visibility: data.visibility === 'public' ? 'public' : 'private',
            createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
            latestNodeSummary: typeof data.latestNodeSummary === "string" ? data.latestNodeSummary : undefined,
            nodeCount: typeof data.nodeCount === "number" ? data.nodeCount : undefined,
            updatedAt,
        });
    }

    return workspaces;
}
