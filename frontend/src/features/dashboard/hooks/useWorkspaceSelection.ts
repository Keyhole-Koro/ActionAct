import { useState, useCallback } from "react";

/**
 * ワークスペースの一括選択ロジックを管理するカスタムフック
 */
export function useWorkspaceSelection() {
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // 単一選択の切り替え
    const toggleSelect = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    }, []);

    // 全選択
    const selectAll = useCallback((ids: string[]) => {
        setSelectedIds(new Set(ids));
    }, []);

    // 選択解除・モード終了
    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
        setIsSelectionMode(false);
    }, []);

    return {
        isSelectionMode,
        setIsSelectionMode,
        selectedIds,
        toggleSelect,
        selectAll,
        clearSelection,
    };
}