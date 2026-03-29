import { useState, useEffect } from "react";
import type { Layout } from "@/features/dashboard/components/LayoutToggle";

export type SortKey = "createdAt" | "lastAccessedAt";
export type SortDir = "desc" | "asc";

interface DashboardPreferences {
    sortKey: SortKey;
    sortDir: SortDir;
    /** お気に入りセクションのレイアウト */
    layoutFav: Layout;
    /** すべてのワークスペースセクションのレイアウト */
    layoutAll: Layout;
    /** お気に入りの「もっと見る」展開状態 */
    showAllFavorites: boolean;
}

const STORAGE_KEY = "dashboard:preferences";

const DEFAULTS: DashboardPreferences = {
    sortKey: "lastAccessedAt",
    sortDir: "desc",
    layoutFav: "grid",
    layoutAll: "grid",
    showAllFavorites: false,
};

function loadPreferences(): DashboardPreferences {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULTS;
        return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
        return DEFAULTS;
    }
}

/**
 * ダッシュボードの表示設定を localStorage に永続化するフック。
 *
 * - クライアントサイドナビゲーション時は lazy initializer で初期レンダリングから
 *   正しい値を使用し、設定リセットのちらつきを防ぐ。
 * - SSR 時は DEFAULTS にフォールバックし、ハイドレーション後に useEffect で補正する。
 */
export function useDashboardPreferences() {
    const [prefs, setPrefs] = useState<DashboardPreferences>(() => {
        // クライアントサイドナビゲーションでは即時 localStorage を参照する
        if (typeof window === "undefined") return DEFAULTS;
        return loadPreferences();
    });

    // SSR からのハイドレーション後に正しい値へ補正する（client navigation では不要だが無害）
    useEffect(() => {
        setPrefs(loadPreferences());
    }, []);

    const update = <K extends keyof DashboardPreferences>(
        key: K,
        value: DashboardPreferences[K],
    ) => {
        setPrefs((prev) => {
            const next = { ...prev, [key]: value };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    return { prefs, update };
}
