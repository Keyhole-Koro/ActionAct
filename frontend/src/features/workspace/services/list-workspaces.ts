import { collectionGroup, getDocs, getDoc, query, where } from "firebase/firestore";

import { firestore } from "@/services/firebase/firestore";
import { type WorkspaceData } from "./workspace-service";

export async function listUserWorkspaces(uid: string): Promise<WorkspaceData[]> {
    const membersQuery = query(
        collectionGroup(firestore, "members"),
        where("uid", "==", uid),
    );

    const memberSnaps = await getDocs(membersQuery);
    const workspaces: WorkspaceData[] = [];

    for (const memberDoc of memberSnaps.docs) {
        const workspaceRef = memberDoc.ref.parent.parent;
        if (!workspaceRef) continue;

        const workspaceSnap = await getDoc(workspaceRef);
        if (!workspaceSnap.exists()) continue;

        const data = workspaceSnap.data();
        if (data.status === "deleted") continue;
        workspaces.push({
            id: workspaceSnap.id,
            name: typeof data.name === "string" && data.name.trim() ? data.name : workspaceSnap.id,
            isFavorite: data.isFavorite === true,
            status: data.status ?? "active",
            userId: data.userId ?? "",
            createdAt: data.createdAt ?? null,
            lastAccessedAt: data.lastAccessedAt ?? null,
        });
    }

    return workspaces;
}
