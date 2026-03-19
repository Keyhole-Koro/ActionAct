import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Edge, Node } from '@xyflow/react';
import { useAgentInteractionStore } from '@/features/agentInteraction/store/interactionStore';
import { projectSelectionGroups } from '@/features/agentInteraction/selectors/projectSelectionGroups';
import { projectActOverlay } from '../selectors/projectActOverlay';
import { projectPersistedGraph } from '../selectors/projectPersistedGraph';
import type { GraphNodeBase, PersistedNodeData } from '../types';

interface UseGraphLayoutOptions {
    persistedNodes: Node<PersistedNodeData>[];
    persistedEdges: Edge[];
    actNodes: Node[];
    actEdges: Edge[];
    expandedNodeIds: string[];
    expandedBranchNodeIds: string[];
    workspaceId: string | undefined | null;
    usePersistedGraphMock: boolean;
}

interface UseGraphLayoutResult {
    persistedLayoutMode: 'radial' | 'orbit';
    effectiveWorkspaceId: string | undefined | null;
    effectiveTopicId: string | undefined;
    setLayoutMode: (mode: 'radial' | 'orbit') => void;
    actNodesStructuralKey: string;
    actNodesForLayout: GraphNodeBase[];
    persistedGraph: ReturnType<typeof projectPersistedGraph>;
    isRadialLayout: boolean;
    actNodesForRadial: GraphNodeBase[];
    actEdgesForRadial: Edge[];
    radialOverviewGraph: ReturnType<typeof projectPersistedGraph>;
    fullActNodeDataById: Map<string, GraphNodeBase['data']>;
    actChildrenByParent: Map<string, string[]>;
    positionedActNodes: GraphNodeBase[];
    regularGraphNodes: GraphNodeBase[];
    selectionProjection: ReturnType<typeof projectSelectionGroups>;
    allReferenceableNodes: GraphNodeBase[];
    referenceableNodeById: Map<string, GraphNodeBase>;
    persistedParentById: Map<string, string | undefined>;
    persistedRootIdByNode: Map<string, string>;
}

export function useGraphLayout({
    persistedNodes,
    persistedEdges,
    actNodes,
    actEdges,
    expandedNodeIds,
    expandedBranchNodeIds,
    workspaceId,
    usePersistedGraphMock,
}: UseGraphLayoutOptions): UseGraphLayoutResult {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const selectionGroups = useAgentInteractionStore((state) => state.groups);
    const toggleSelectionOption = useAgentInteractionStore((state) => state.toggleOptionSelection);
    const confirmSelection = useAgentInteractionStore((state) => state.confirmSelection);
    const clearSelectionGroup = useAgentInteractionStore((state) => state.clearSelection);
    const cancelSelectionGroup = useAgentInteractionStore((state) => state.cancelGroup);

    const persistedLayoutMode = useMemo(() => {
        const layout = searchParams.get('layout');
        if (layout === 'radial') return 'radial' as const;
        return 'orbit' as const;
    }, [searchParams]);

    const setLayoutMode = useCallback((mode: 'radial' | 'orbit') => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('layout', mode);
        router.push(`${pathname}?${params.toString()}`);
    }, [pathname, router, searchParams]);

    const effectiveWorkspaceId = useMemo(
        () => (usePersistedGraphMock ? 'ws-mock-public' : workspaceId),
        [usePersistedGraphMock, workspaceId],
    );
    const effectiveTopicId = usePersistedGraphMock ? 'topic-mock-1' : undefined;

    // Structural key: only fields that affect tree topology and Y-anchoring.
    const actNodesStructuralKey = (actNodes as GraphNodeBase[]).map((n) => {
        const refs = Array.isArray(n.data?.referencedNodeIds)
            ? (n.data.referencedNodeIds as unknown[])
                .filter((v): v is string => typeof v === 'string')
                .join(',')
            : '';
        const parentId = typeof n.data?.parentId === 'string' ? n.data.parentId : '';
        const kind = typeof n.data?.kind === 'string' ? n.data.kind : '';
        return `${n.id}:${kind}:${parentId}:${refs}`;
    }).join('|');

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const actNodesForLayout = useMemo(() => (actNodes as GraphNodeBase[]).map((n) => ({
        ...n,
        data: {
            kind: n.data?.kind,
            nodeSource: n.data?.nodeSource,
            label: n.data?.label,
            topicId: n.data?.topicId,
            referencedNodeIds: n.data?.referencedNodeIds,
            parentId: n.data?.parentId,
            isManualPosition: n.data?.isManualPosition,
        },
    } as GraphNodeBase)), [actNodesStructuralKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const persistedGraph = useMemo(
        () => projectPersistedGraph(
            persistedNodes as GraphNodeBase[],
            persistedEdges,
            persistedLayoutMode,
            expandedBranchNodeIds,
        ),
        [expandedBranchNodeIds, persistedEdges, persistedLayoutMode, persistedNodes],
    );
    const isRadialLayout = persistedLayoutMode === 'radial';

    // Act nodes adapted for the radial overview: parentId = primary anchor (referencedNodeIds[0])
    const actNodesForRadial = useMemo(() => {
        const persistedIdSet = new Set(persistedNodes.map((n) => n.id));
        return (actNodes as GraphNodeBase[]).map((node) => {
            const referencedIds: string[] = Array.isArray(node.data?.referencedNodeIds)
                ? (node.data.referencedNodeIds as unknown[]).filter((v): v is string => typeof v === 'string')
                : [];
            const anchor = referencedIds.find((id) => persistedIdSet.has(id));
            return {
                ...node,
                data: {
                    ...node.data,
                    parentId: anchor ?? undefined,
                },
            };
        });
    }, [actNodes, persistedNodes]);

    const actEdgesForRadial = useMemo(() =>
        actNodesForRadial
            .filter((node) => typeof node.data?.parentId === 'string')
            .map((node) => ({
                id: `radial-act-edge-${node.id}`,
                source: node.data!.parentId as string,
                target: node.id,
                animated: false,
            })),
        [actNodesForRadial],
    );

    const radialOverviewGraph = useMemo(
        () => projectPersistedGraph(
            [...persistedNodes, ...actNodesForRadial] as GraphNodeBase[],
            [...persistedEdges, ...actEdgesForRadial],
            'radial',
        ),
        [actEdgesForRadial, actNodesForRadial, persistedEdges, persistedNodes],
    );

    // Full act node data keyed by id.
    const fullActNodeDataById = useMemo(
        () => new Map((actNodes as GraphNodeBase[]).map((n) => [n.id, n.data])),
        [actNodes],
    );

    // Parent → children map for act nodes.
    const actChildrenByParent = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const [id, data] of fullActNodeDataById) {
            const parentId = typeof data?.parentId === 'string' ? data.parentId : undefined;
            if (parentId) {
                const arr = map.get(parentId) ?? [];
                arr.push(id);
                map.set(parentId, arr);
            }
        }
        return map;
    }, [fullActNodeDataById]);

    // Rectangle-first act node layout.
    const positionedActNodes = useMemo(() => {
        if (persistedLayoutMode !== 'orbit') return [];
        return projectActOverlay({
            actNodes: actNodesForLayout,
            persistedNodes: persistedGraph.positionedNodes,
            expandedNodeIds,
        });
    }, [actNodesForLayout, expandedNodeIds, persistedGraph.positionedNodes, persistedLayoutMode]);

    const regularGraphNodes = useMemo(
        () => [...persistedGraph.positionedNodes, ...positionedActNodes],
        [persistedGraph.positionedNodes, positionedActNodes],
    );

    const selectionProjection = useMemo(
        () => projectSelectionGroups({
            groups: Object.values(selectionGroups),
            baseNodes: regularGraphNodes,
            expandedNodeIds,
            actions: {
                toggleOptionSelection: toggleSelectionOption,
                confirmSelection,
                clearSelection: clearSelectionGroup,
                cancelGroup: cancelSelectionGroup,
            },
        }),
        [cancelSelectionGroup, clearSelectionGroup, confirmSelection, expandedNodeIds, regularGraphNodes, selectionGroups, toggleSelectionOption],
    );

    const allReferenceableNodes = useMemo(
        () => persistedGraph.positionedNodes,
        [persistedGraph.positionedNodes],
    );

    const referenceableNodeById = useMemo(
        () => new Map(allReferenceableNodes.map((node) => [node.id, node])),
        [allReferenceableNodes],
    );

    const persistedParentById = useMemo(
        () => new Map(
            persistedNodes.map((node) => [
                node.id,
                typeof node.data?.parentId === 'string' ? node.data.parentId : undefined,
            ]),
        ),
        [persistedNodes],
    );

    // Computed early so both layoutAwareDisplayNodes and displayEdges can share it.
    const persistedRootIdByNode = useMemo(() => {
        const resolved = new Map<string, string>();
        const parentById = new Map(
            persistedGraph.positionedNodes.map((node) => [
                node.id,
                typeof node.data?.parentId === 'string' ? node.data.parentId : undefined,
            ]),
        );
        persistedGraph.positionedNodes.forEach((node) => {
            let cur: string | undefined = node.id;
            let root = node.id;
            while (cur) {
                const p = parentById.get(cur);
                if (!p) { root = cur; break; }
                cur = p;
            }
            resolved.set(node.id, root);
        });
        return resolved;
    }, [persistedGraph.positionedNodes]);

    return {
        persistedLayoutMode,
        effectiveWorkspaceId,
        effectiveTopicId,
        setLayoutMode,
        actNodesStructuralKey,
        actNodesForLayout,
        persistedGraph,
        isRadialLayout,
        actNodesForRadial,
        actEdgesForRadial,
        radialOverviewGraph,
        fullActNodeDataById,
        actChildrenByParent,
        positionedActNodes,
        regularGraphNodes,
        selectionProjection,
        allReferenceableNodes,
        referenceableNodeById,
        persistedParentById,
        persistedRootIdByNode,
    };
}
