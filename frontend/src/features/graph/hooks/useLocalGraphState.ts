import React, { useCallback, useEffect, useRef } from 'react';

const RECENT_CLICKED_NODE_LIMIT = 8;

interface UseLocalGraphStateOptions {
    workspaceId: string | undefined | null;
}

interface UseLocalGraphStateResult {
    recentClickedNodeIds: string[];
    setRecentClickedNodeIds: React.Dispatch<React.SetStateAction<string[]>>;
    customNodeSizes: Map<string, { width: number; height: number }>;
    recordRecentClickedNode: (nodeId: string) => void;
    handleNodeResize: (nodeId: string, width: number, height: number) => void;
}

export function useLocalGraphState({
    workspaceId,
}: UseLocalGraphStateOptions): UseLocalGraphStateResult {
    const recentStorageKey = workspaceId ? `graph.recentClickedNodeIds.${workspaceId}` : null;
    const [recentClickedNodeIds, setRecentClickedNodeIds] = React.useState<string[]>([]);
    const [customNodeSizes, setCustomNodeSizes] = React.useState<Map<string, { width: number; height: number }>>(new Map());

    // Load from localStorage when workspaceId becomes available
    const loadedWorkspaceIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (!workspaceId || loadedWorkspaceIdRef.current === workspaceId) return;
        loadedWorkspaceIdRef.current = workspaceId;
        if (typeof window === 'undefined') return;
        try {
            const stored = window.localStorage.getItem(`graph.recentClickedNodeIds.${workspaceId}`);
            if (stored) setRecentClickedNodeIds(JSON.parse(stored) as string[]);
        } catch { /* ignore */ }
        try {
            const storedSizes = window.localStorage.getItem(`graph.nodeSizes.${workspaceId}`);
            if (storedSizes) setCustomNodeSizes(new Map(JSON.parse(storedSizes) as [string, { width: number; height: number }][]));
        } catch { /* ignore */ }
    }, [workspaceId]);

    const recordRecentClickedNode = useCallback((nodeId: string) => {
        setRecentClickedNodeIds((previous) => {
            const next = [nodeId, ...previous.filter((id) => id !== nodeId)].slice(0, RECENT_CLICKED_NODE_LIMIT);
            if (typeof window !== 'undefined' && recentStorageKey) {
                try { window.localStorage.setItem(recentStorageKey, JSON.stringify(next)); } catch { /* ignore quota errors */ }
            }
            return next;
        });
    }, [recentStorageKey]);

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number) => {
        setCustomNodeSizes((prev) => {
            const next = new Map(prev);
            next.set(nodeId, { width, height });
            if (typeof window !== 'undefined' && workspaceId) {
                try { window.localStorage.setItem(`graph.nodeSizes.${workspaceId}`, JSON.stringify([...next])); } catch { /* ignore quota errors */ }
            }
            return next;
        });
    }, [workspaceId]);

    return {
        recentClickedNodeIds,
        setRecentClickedNodeIds,
        customNodeSizes,
        recordRecentClickedNode,
        handleNodeResize,
    };
}
