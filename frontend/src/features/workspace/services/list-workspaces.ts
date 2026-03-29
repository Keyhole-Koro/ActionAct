import { collectionGroup, getDocs, getDoc, query, where } from "firebase/firestore";

import { firestore } from "@/services/firebase/firestore";
import { type WorkspaceData } from "./workspace-service";

/**
 * 指定ユーザーが所属するアクティブなワークスペース一覧を取得する。
 * members サブコレクションを collectionGroup で横断検索し、
 * 各ワークスペースの全フィールド（isFavorite・日付類含む）を返す。
 */
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
        throw new Error(
            `members query failed for uid=${uid}: ${error instanceof Error ? error.message : String(error)}`,
        );
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
                message: error instanceof Error ? error.message : String(error),
            });
            throw new Error(
                `workspace read failed for ${workspaceRef.path}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        if (!workspaceSnap.exists()) continue;

        const data = workspaceSnap.data();

        // ゴミ箱に移動済みのワークスペースはダッシュボードに表示しない
        if (data.status === "deleted") continue;

        workspaces.push({
            id: workspaceSnap.id,
            name: typeof data.name === "string" && data.name.trim() ? data.name : workspaceSnap.id,
            status: data.status ?? undefined,
            isFavorite: data.isFavorite === true,
            createdAt: data.createdAt ?? null,
            lastAccessedAt: data.lastAccessedAt ?? null,
            deletedAt: data.deletedAt ?? null,
            createdBy: typeof data.createdBy === "string" ? data.createdBy : undefined,
            visibility: data.visibility === "public" ? "public" : "private",
            latestNodeSummary: typeof data.latestNodeSummary === "string" ? data.latestNodeSummary : undefined,
            nodeCount: typeof data.nodeCount === "number" ? data.nodeCount : undefined,
            updatedAt: data.updatedAt ?? undefined,
        });
    }

    return workspaces;
}
