import { firestore } from "@/services/firebase/firestore";
import { getFirebaseIdToken } from "@/services/firebase/token";
import { config } from "@/lib/config";
import {
    doc,
    onSnapshot,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    getDocs,
    orderBy,
    Timestamp,
    type DocumentData,
} from "firebase/firestore";

export interface WorkspaceData {
    id: string;
    name: string;
    // ダッシュボード / ゴミ箱用フィールド
    userId?: string;
    createdBy?: string;
    status?: "active" | "deleted";
    isFavorite?: boolean;
    createdAt?: any;
    lastAccessedAt?: any;
    deletedAt?: any;
    // ワークスペース機能フィールド
    visibility?: "public" | "private";
    latestNodeSummary?: string;
    nodeCount?: number;
    updatedAt?: any;
}

// ─── ヘルパー ────────────────────────────────────────────────

function workspaceDoc(workspaceId: string) {
    return doc(firestore, `workspaces/${workspaceId}`);
}

function readString(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() ? value : fallback;
}

function toWorkspaceData(workspaceId: string, data: DocumentData): WorkspaceData {
    const rawVisibility = data.visibility;
    const updatedAt = data.updatedAt && typeof data.updatedAt.toMillis === "function"
        ? data.updatedAt.toMillis()
        : data.updatedAt ?? undefined;

    return {
        id: workspaceId,
        name: readString(data.name, workspaceId),
        visibility: rawVisibility === "public" ? "public" : "private",
        createdBy: typeof data.createdBy === "string" ? data.createdBy : undefined,
        latestNodeSummary: typeof data.latestNodeSummary === "string" ? data.latestNodeSummary : undefined,
        nodeCount: typeof data.nodeCount === "number" ? data.nodeCount : undefined,
        updatedAt,
        status: data.status ?? undefined,
        isFavorite: data.isFavorite === true,
        createdAt: data.createdAt ?? null,
        lastAccessedAt: data.lastAccessedAt ?? null,
        deletedAt: data.deletedAt ?? null,
    };
}

// ─── サービス ────────────────────────────────────────────────

export const workspaceService = {
    // リアルタイム購読
    subscribeWorkspace(
        workspaceId: string,
        callback: (workspace: WorkspaceData | null) => void,
    ) {
        const ref = workspaceDoc(workspaceId);
        return onSnapshot(
            ref,
            (snapshot) => {
                if (!snapshot.exists()) { callback(null); return; }
                callback(toWorkspaceData(snapshot.id, snapshot.data()));
            },
            (error) => console.error("Workspace subscription failed:", error),
        );
    },

    // 公開設定変更
    async updateVisibility(workspaceId: string, visibility: "public" | "private") {
        const idToken = await getFirebaseIdToken();
        if (!idToken) throw new Error("authentication required");

        const response = await fetch(`${config.actApiBaseUrl}/api/workspace/visibility`, {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ workspace_id: workspaceId, visibility }),
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || "failed to update workspace visibility");
        }
    },

    // 名前変更
    async updateWorkspaceName(workspaceId: string, newName: string) {
        const trimmedName = newName.trim();
        if (!trimmedName) throw new Error("workspace name is required");

        const idToken = await getFirebaseIdToken();
        if (!idToken) throw new Error("authentication required");

        const response = await fetch(`${config.actApiBaseUrl}/api/workspace/rename`, {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ workspace_id: workspaceId, name: trimmedName }),
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || "failed to rename workspace");
        }
    },

    // ゴミ箱へ移動（論理削除）
    async deleteWorkspace(id: string) {
        const docRef = doc(firestore, "workspaces", id);
        return await updateDoc(docRef, {
            status: "deleted",
            deletedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
    },

    // 復元
    async restoreWorkspace(id: string) {
        const docRef = doc(firestore, "workspaces", id);
        return await updateDoc(docRef, {
            status: "active",
            updatedAt: Timestamp.now(),
        });
    },

    // 完全削除
    async permanentDeleteWorkspace(id: string) {
        const docRef = doc(firestore, "workspaces", id);
        return await deleteDoc(docRef);
    },

    // お気に入り切り替え
    async toggleFavorite(id: string, isFavorite: boolean) {
        const docRef = doc(firestore, "workspaces", id);
        return await updateDoc(docRef, { isFavorite });
    },

    // ゴミ箱一覧取得
    async listTrashWorkspaces(userId: string): Promise<WorkspaceData[]> {
        const q = query(
            collection(firestore, "workspaces"),
            where("createdBy", "==", userId),
            where("status", "==", "deleted"),
            orderBy("updatedAt", "desc"),
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => {
            const data = d.data();
            return {
                ...data,
                id: d.id,
                name: readString(data.name, d.id),
            } as WorkspaceData;
        });
    },
};
