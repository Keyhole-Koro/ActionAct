import type { WorkspaceData } from "@/features/workspace/services/workspace-service";

/** Firebase Timestamp・Date・数値を ms に統一する */
export function tsToMs(ts: unknown): number {
    if (!ts) return 0;
    if (typeof (ts as any).toDate === "function") return (ts as any).toDate().getTime();
    return new Date(ts as any).getTime();
}

/** タイムスタンプを「YYYY年M月D日」形式の文字列に変換する（null なら null） */
export function formatDate(ts: unknown): string | null {
    if (!ts) return null;
    try {
        const date: Date =
            typeof (ts as any).toDate === "function"
                ? (ts as any).toDate()
                : new Date(ts as any);
        return date.toLocaleDateString("ja-JP", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    } catch {
        return null;
    }
}

/** ワークスペースリストを指定キー・方向でソートして返す */
export function sortWorkspaces<K extends keyof WorkspaceData>(
    list: WorkspaceData[],
    key: K,
    dir: "asc" | "desc",
): WorkspaceData[] {
    return [...list].sort((a, b) => {
        const diff = tsToMs(a[key]) - tsToMs(b[key]);
        return dir === "desc" ? -diff : diff;
    });
}
