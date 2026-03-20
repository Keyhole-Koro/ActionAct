import { firestore } from "@/services/firebase/firestore";
import {
    doc,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    getDocs,
    orderBy,
    Timestamp
} from "firebase/firestore";

export interface WorkspaceData {
    id: string;
    name: string;
    userId: string;
    status: "active" | "deleted";
    isFavorite: boolean;
    createdAt: any;
    lastAccessedAt: any;
    deletedAt: any;
}

export const workspaceService = {
    // ゴミ箱へ移動（論理削除）
    async deleteWorkspace(id: string) {
        const docRef = doc(firestore, "workspaces", id);
        return await updateDoc(docRef, {
            status: "deleted",
            deletedAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });
    },

    // 復元（ステータスをactiveに戻す）
    async restoreWorkspace(id: string) {
        const docRef = doc(firestore, "workspaces", id);
        return await updateDoc(docRef, {
            status: "active",
            updatedAt: Timestamp.now()
        });
    },

    // 完全に削除（物理削除）
    async permanentDeleteWorkspace(id: string) {
        const docRef = doc(firestore, "workspaces", id);
        return await deleteDoc(docRef);
    },

    // お気に入りの切り替え
    async toggleFavorite(id: string, isFavorite: boolean) {
        const docRef = doc(firestore, "workspaces", id);
        return await updateDoc(docRef, { isFavorite });
    },

    // ゴミ箱内のワークスペース一覧取得
    async listTrashWorkspaces(userId: string): Promise<WorkspaceData[]> {
        const q = query(
            collection(firestore, "workspaces"),
            where("createdBy", "==", userId),
            where("status", "==", "deleted"),
            orderBy("updatedAt", "desc")
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => {
            const data = d.data();
            return {
                ...data,
                id: d.id,
                name: typeof data.name === "string" && data.name.trim() ? data.name : d.id,
            } as WorkspaceData;
        });
    }
};
