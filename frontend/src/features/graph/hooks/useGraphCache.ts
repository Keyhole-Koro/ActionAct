"use client";

import { useEffect, useRef } from 'react';
import type { Edge, Node } from '@xyflow/react';

function cacheKey(kind: 'persisted' | 'act', workspaceId: string) {
    return `graph.${kind}.${workspaceId}`;
}

function serializeGraph(nodes: Node[], edges: Edge[]) {
    return JSON.stringify({ nodes, edges });
}

function deserializeGraph(rawValue: string | null): { nodes: Node[]; edges: Edge[] } | null {
    if (!rawValue) {
        return null;
    }

    try {
        const parsed = JSON.parse(rawValue) as { nodes?: Node[]; edges?: Edge[] };
        return {
            nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
            edges: Array.isArray(parsed.edges) ? parsed.edges : [],
        };
    } catch {
        return null;
    }
}

type UseGraphCacheParams = {
    kind: 'persisted' | 'act';
    workspaceId: string;
    nodes: Node[];
    edges: Edge[];
    setGraph: (nodes: Node[], edges: Edge[]) => void;
    removeWhenEmpty?: boolean;
};

export function useGraphCache({
    kind,
    workspaceId,
    nodes,
    edges,
    setGraph,
    removeWhenEmpty = false,
}: UseGraphCacheParams) {
    const hydratedCacheKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const key = cacheKey(kind, workspaceId);
        if (hydratedCacheKeyRef.current === key) {
            return;
        }

        hydratedCacheKeyRef.current = key;
        const cachedGraph = deserializeGraph(window.localStorage.getItem(key));
        if (cachedGraph) {
            setGraph(cachedGraph.nodes, cachedGraph.edges);
            return;
        }

        if (kind === 'act') {
            setGraph([], []);
        }
    }, [kind, setGraph, workspaceId]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const key = cacheKey(kind, workspaceId);
        if (removeWhenEmpty && nodes.length === 0 && edges.length === 0) {
            window.localStorage.removeItem(key);
            return;
        }

        if (nodes.length === 0 && edges.length === 0) {
            return;
        }

        window.localStorage.setItem(key, serializeGraph(nodes, edges));
    }, [edges, kind, nodes, removeWhenEmpty, workspaceId]);
}

export function removeGraphCache(kind: 'persisted' | 'act', workspaceId: string) {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.removeItem(cacheKey(kind, workspaceId));
}
