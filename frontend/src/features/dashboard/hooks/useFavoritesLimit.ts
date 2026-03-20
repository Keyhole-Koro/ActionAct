import { useState, useEffect } from "react";

const STORAGE_KEY = "dashboard:favoritesLimit";
const CHANGE_EVENT = "dashboard:favoritesLimitChange";
const DEFAULT_LIMIT = 6;

function readLimit(): number {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
    } catch {
        // localStorage が使えない環境（SSR 等）ではデフォルト値を返す
    }
    return DEFAULT_LIMIT;
}

/**
 * お気に入りの表示件数を localStorage に永続化するフック。
 *
 * Sidebar と DashboardPage は別々のフックインスタンスを持つため、
 * カスタムイベントで同一ページ内のインスタンス間を同期する。
 */
export function useFavoritesLimit() {
    const [limit, setLimitState] = useState<number>(() => {
        if (typeof window === "undefined") return DEFAULT_LIMIT;
        return readLimit();
    });

    useEffect(() => {
        // SSR ハイドレーション後の補正
        setLimitState(readLimit());

        // 同一ページ内の他インスタンス（Sidebar など）からの変更を受け取る
        const handleChange = (e: Event) => {
            setLimitState((e as CustomEvent<number>).detail);
        };
        window.addEventListener(CHANGE_EVENT, handleChange);
        return () => window.removeEventListener(CHANGE_EVENT, handleChange);
    }, []);

    const setLimit = (value: number) => {
        const clamped = Math.max(1, value);
        setLimitState(clamped);
        localStorage.setItem(STORAGE_KEY, String(clamped));
        // 同一ページ内の他インスタンスに変更を通知する
        window.dispatchEvent(new CustomEvent<number>(CHANGE_EVENT, { detail: clamped }));
    };

    return { limit, setLimit };
}
