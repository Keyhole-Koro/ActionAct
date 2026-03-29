import { useState, useEffect } from "react";
import type { Layout } from "@/features/dashboard/components/LayoutToggle";

export type TrashSortKey = "deletedAt" | "createdAt";
export type SortDir = "desc" | "asc";

interface TrashPreferences {
    sortKey: TrashSortKey;
    sortDir: SortDir;
    layout: Layout;
}

const STORAGE_KEY = "dashboard:trashPreferences";

const DEFAULTS: TrashPreferences = {
    sortKey: "deletedAt",
    sortDir: "desc",
    layout: "list",
};

function loadPreferences(): TrashPreferences {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULTS;
        return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
        return DEFAULTS;
    }
}

/**
 * ゴミ箱の表示設定を localStorage に永続化するフック。
 *
 * - クライアントサイドナビゲーション時は lazy initializer で初期レンダリングから
 *   正しい値を使用し、設定リセットのちらつきを防ぐ。
 * - SSR 時は DEFAULTS にフォールバックし、ハイドレーション後に useEffect で補正する。
 */
export function useTrashPreferences() {
    const [prefs, setPrefs] = useState<TrashPreferences>(() => {
        if (typeof window === "undefined") return DEFAULTS;
        return loadPreferences();
    });

    useEffect(() => {
        setPrefs(loadPreferences());
    }, []);

    const update = <K extends keyof TrashPreferences>(
        key: K,
        value: TrashPreferences[K],
    ) => {
        setPrefs((prev) => {
            const next = { ...prev, [key]: value };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    return { prefs, update };
}
