import { collectionGroup, getDocs, getDoc, query, where } from "firebase/firestore";

import { firestore } from "@/services/firebase/firestore";
import { type WorkspaceData } from "./workspace-service";

export async function listUserWorkspaces(uid: string): Promise<WorkspaceData[]> {
    console.log(`[Debug] Listing workspaces for uid: ${uid}`);
    const membersQuery = query(
        collectionGroup(firestore, "members"),
        where("uid", "==", uid),
    );

    const memberSnaps = await getDocs(membersQuery);
    console.log(`[Debug] Found ${memberSnaps.docs.length} membership documents`);

    const workspaces: WorkspaceData[] = [];

    for (const memberDoc of memberSnaps.docs) {
        console.log(`[Debug] Member doc path: ${memberDoc.ref.path}`);
        const workspaceRef = memberDoc.ref.parent.parent;
        if (!workspaceRef) {
            console.log(`[Debug] No parent workspace found for member doc`);
            continue;
        }

        const workspaceSnap = await getDoc(workspaceRef);
        if (!workspaceSnap.exists()) {
            console.log(`[Debug] Workspace document does not exist: ${workspaceRef.path}`);
            continue;
        }

        const data = workspaceSnap.data();
        console.log(`[Debug] Workspace data for ${workspaceSnap.id}:`, data);

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

    console.log(`[Debug] Returning ${workspaces.length} workspaces total`);
    return workspaces;
}
