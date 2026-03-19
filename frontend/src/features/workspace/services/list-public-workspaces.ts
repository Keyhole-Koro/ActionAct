import { collection, getDocs, query, where } from "firebase/firestore";

import { firestore } from "@/services/firebase/firestore";
import { type WorkspaceData } from "./workspace-service";

export async function listPublicWorkspaces(): Promise<WorkspaceData[]> {
    const q = query(
        collection(firestore, "workspaces"),
        where("visibility", "==", "public"),
    );

    const snaps = await getDocs(q);
    return snaps.docs.map((snap) => {
        const data = snap.data();
        const updatedAt = data.updatedAt && typeof data.updatedAt.toMillis === "function"
            ? data.updatedAt.toMillis()
            : undefined;

        return {
            id: snap.id,
            name: typeof data.name === "string" && data.name.trim() ? data.name : snap.id,
            visibility: "public" as const,
            createdBy: typeof data.createdBy === "string" ? data.createdBy : undefined,
            latestNodeSummary: typeof data.latestNodeSummary === "string" ? data.latestNodeSummary : undefined,
            nodeCount: typeof data.nodeCount === "number" ? data.nodeCount : undefined,
            updatedAt,
        };
    });
}
