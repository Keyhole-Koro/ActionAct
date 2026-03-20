import { useCallback, useEffect, useRef } from 'react';
import { Node } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { getAuth } from 'firebase/auth';
import { useStreamPreferencesStore } from '@/features/agentTools/store/stream-preferences-store';
import { upsertActNodeDraft } from '@/features/graph/runtime/act-graph-actions';
import { readClientPoint } from '../components/graphCanvas/graphCanvasUtils';
import type { GraphNodeBase, GraphNodeRender } from '../types';
import type { useGraphCommands } from './useGraphCommands';

const ZOOM_LEVELS = [0.4, 0.65, 1.0, 1.5] as const;

interface UseGraphInteractionsOptions {
    isReadOnly: boolean;
    isRadialLayout: boolean;
    isStreaming: boolean;
    selectedNodeIds: string[];
    selectedNodeIdsRef: React.MutableRefObject<string[]>;
    activeNodeId: string | null;
    editingNodeId: string | null;
    actNodes: GraphNodeBase[];
    emphasizedDisplayNodes: Node[];
    effectiveWorkspaceId: string | undefined | null;
    collapseThresholdMinutes: number;
    activeNodeIdRef: React.MutableRefObject<string | null>;
    pendingRadialFocusNodeIdRef: React.MutableRefObject<string | null>;
    persistedParentById: Map<string, string | undefined>;
    radialOverviewNodeById: Map<string, Node>;
    setSelectedNodes: (nodeIds: string[]) => void;
    setActiveNode: (nodeId: string | null) => void;
    clearAllFocus: () => void;
    addQueryActNode: (position: { x: number; y: number }, label: string, options?: { isManualPosition?: boolean }) => string;
    addEmptyActNode: (position: { x: number; y: number }) => string;
    collapseUnusedNodes: (now: number, thresholdMs: number) => void;
    recordNodeUsed: (nodeId: string) => void;
    recordRecentClickedNode: (nodeId: string) => void;
    focusNode: (nodeId: string) => void;
    focusActNode: (nodeId: string) => void;
    commands: ReturnType<typeof useGraphCommands>;
    expandedBranchNodeIds: string[];
    toggleExpandedNode: (nodeId: string) => void;
}

interface UseGraphInteractionsResult {
    handlePaneDoubleClick: (event: React.MouseEvent) => void;
    handleSelectionChange: (args: { nodes: Node[] }) => void;
    handleSelectionTyping: (event: KeyboardEvent) => void;
    handleKeyNavigation: (event: KeyboardEvent) => void;
    activateRadialNode: (nodeId: string) => void;
    handleSelectRecentNode: (nodeId: string) => void;
    isShiftMarqueeSelectionRef: React.MutableRefObject<boolean>;
    suppressNextSelectionChangeRef: React.MutableRefObject<boolean>;
    shiftMarqueeStartRef: React.MutableRefObject<{ x: number; y: number } | null>;
}

export function useGraphInteractions({
    isReadOnly,
    isRadialLayout,
    isStreaming,
    selectedNodeIds,
    selectedNodeIdsRef,
    activeNodeId,
    editingNodeId,
    actNodes,
    emphasizedDisplayNodes,
    effectiveWorkspaceId,
    collapseThresholdMinutes,
    activeNodeIdRef,
    pendingRadialFocusNodeIdRef,
    persistedParentById,
    radialOverviewNodeById,
    setSelectedNodes,
    setActiveNode,
    clearAllFocus,
    addQueryActNode,
    addEmptyActNode,
    collapseUnusedNodes,
    recordNodeUsed,
    recordRecentClickedNode,
    focusNode,
    focusActNode,
    commands,
    expandedBranchNodeIds,
    toggleExpandedNode,
}: UseGraphInteractionsOptions): UseGraphInteractionsResult {
    const reactFlowInstance = useReactFlow();
    const isShiftMarqueeSelectionRef = useRef(false);
    const suppressNextSelectionChangeRef = useRef(false);
    const shiftMarqueeStartRef = useRef<{ x: number; y: number } | null>(null);

    const handlePaneDoubleClick = useCallback((event: React.MouseEvent) => {
        if (isReadOnly) return;
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        const pane = target.closest('.react-flow__pane') || isRadialLayout;
        const node = target.closest('.react-flow__node');
        const control = target.closest('button, input, textarea, [role="button"]');
        if (!pane || node || control) {
            return;
        }

        const flowPosition = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        const myUid = getAuth().currentUser?.uid;

        if (selectedNodeIds.length > 0) {
            const composerNodeId = addQueryActNode(flowPosition, '', { isManualPosition: true });
            if (effectiveWorkspaceId) {
                void upsertActNodeDraft(effectiveWorkspaceId, composerNodeId, {
                    referencedNodeIds: selectedNodeIds,
                    kind: 'act',
                    createdBy: 'user',
                    authorUid: myUid ?? undefined,
                });
            }
        } else {
            const composerNodeId = addEmptyActNode(flowPosition);
            if (effectiveWorkspaceId) {
                void upsertActNodeDraft(effectiveWorkspaceId, composerNodeId, {
                    kind: 'act',
                    createdBy: 'user',
                    authorUid: myUid ?? undefined,
                    label: '',
                });
            }
        }
    }, [addEmptyActNode, addQueryActNode, selectedNodeIds, reactFlowInstance, isReadOnly, effectiveWorkspaceId, isRadialLayout]);

    const handleSelectionChange = useCallback(({ nodes: changedNodes }: { nodes: Node[] }) => {
        if (isShiftMarqueeSelectionRef.current || suppressNextSelectionChangeRef.current) {
            suppressNextSelectionChangeRef.current = false;
            return;
        }
        const ids = changedNodes
            .filter((n) => n.type === 'customTask' || n.type == null)
            .filter((n) => (n.data as Record<string, unknown>)?.nodeSource !== 'act')
            .map((n) => n.id)
            .sort();
        const current = [...selectedNodeIdsRef.current].sort();
        if (ids.length === current.length && ids.every((id, i) => id === current[i])) {
            return;
        }
        setSelectedNodes(ids);
    }, [setSelectedNodes, selectedNodeIdsRef]);

    const handleSelectionTyping = useCallback((event: KeyboardEvent) => {
        if (selectedNodeIds.length === 0 || editingNodeId) {
            return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
        }
        if (event.key.length !== 1 || /\s/.test(event.key)) {
            return;
        }

        const target = event.target;
        if (
            target instanceof HTMLElement
            && (
                target.tagName === 'INPUT'
                || target.tagName === 'TEXTAREA'
                || target.isContentEditable
            )
        ) {
            return;
        }

        const selectedNodes = emphasizedDisplayNodes.filter((node) => selectedNodeIds.includes(node.id));
        if (selectedNodes.length === 0) {
            return;
        }

        const averageX = selectedNodes.reduce((sum, node) => sum + node.position.x, 0) / selectedNodes.length;
        const maxY = selectedNodes.reduce((max, node) => Math.max(max, node.position.y), selectedNodes[0].position.y);
        const newNodeId = addQueryActNode({ x: averageX, y: maxY + 240 }, event.key);
        if (effectiveWorkspaceId) {
            const myUid = getAuth().currentUser?.uid;
            void upsertActNodeDraft(effectiveWorkspaceId, newNodeId, {
                kind: 'act',
                createdBy: 'user',
                authorUid: myUid ?? undefined,
                label: event.key,
            });
        }
        event.preventDefault();
    }, [addQueryActNode, effectiveWorkspaceId, editingNodeId, emphasizedDisplayNodes, selectedNodeIds]);

    const handleKeyNavigation = useCallback((event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            const target = event.target;
            if (
                target instanceof HTMLElement
                && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
            ) {
                return;
            }
            clearAllFocus();
            return;
        }

        const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key);
        if (!isArrow) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        const target = event.target;
        if (
            target instanceof HTMLElement
            && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        ) {
            return;
        }

        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            const currentZoom = reactFlowInstance.getZoom();
            const nearestIdx = ZOOM_LEVELS.reduce((best, level, idx) =>
                Math.abs(level - currentZoom) < Math.abs(ZOOM_LEVELS[best] - currentZoom) ? idx : best, 0);
            const delta = event.key === 'ArrowUp' ? 1 : -1;
            const nextIdx = Math.min(Math.max(nearestIdx + delta, 0), ZOOM_LEVELS.length - 1);
            if (nextIdx !== nearestIdx) {
                reactFlowInstance.zoomTo(ZOOM_LEVELS[nextIdx], { duration: 220 });
            }
            event.preventDefault();
            return;
        }

        const storeActNodes = actNodes as GraphNodeBase[];
        if (storeActNodes.length === 0) return;

        const currentIndex = storeActNodes.findIndex((node) => node.id === activeNodeId);
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const base = currentIndex < 0 ? (direction === 1 ? -1 : storeActNodes.length) : currentIndex;
        const nextIndex = (base + direction + storeActNodes.length) % storeActNodes.length;
        focusActNode(storeActNodes[nextIndex].id);
        event.preventDefault();
    }, [activeNodeId, actNodes, focusActNode, reactFlowInstance, clearAllFocus]);

    // window イベントリスナー登録のuseEffect
    useEffect(() => {
        const handleFocusNode = (event: Event) => {
            const customEvent = event as CustomEvent<{ nodeId: string }>;
            if (customEvent.detail?.nodeId) {
                toggleExpandedNode(customEvent.detail.nodeId);
                focusNode(customEvent.detail.nodeId);
            }
        };
        window.addEventListener('action:focus-node', handleFocusNode);
        return () => window.removeEventListener('action:focus-node', handleFocusNode);
    }, [focusNode, toggleExpandedNode]);

    useEffect(() => {
        window.addEventListener('keydown', handleSelectionTyping);
        return () => window.removeEventListener('keydown', handleSelectionTyping);
    }, [handleSelectionTyping]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyNavigation);
        return () => window.removeEventListener('keydown', handleKeyNavigation);
    }, [handleKeyNavigation]);

    // 5秒インターバルのuseEffect
    useEffect(() => {
        const collapseThresholdMs = collapseThresholdMinutes * 60_000;
        const id = window.setInterval(() => {
            const currentActiveNodeId = activeNodeIdRef.current;
            if (currentActiveNodeId) {
                recordNodeUsed(currentActiveNodeId);
            }
            collapseUnusedNodes(Date.now(), collapseThresholdMs);
        }, 5_000);
        return () => window.clearInterval(id);
    }, [collapseUnusedNodes, recordNodeUsed, collapseThresholdMinutes, activeNodeIdRef]);

    const activateRadialNode = useCallback((nodeId: string) => {
        recordRecentClickedNode(nodeId);
        setSelectedNodes([...selectedNodeIdsRef.current, nodeId]);
        commands.openDetails(nodeId);

        const radialNode = radialOverviewNodeById.get(nodeId);
        const hasChildNodes = radialNode?.data?.hasChildNodes === true;
        const branchExpanded = radialNode?.data?.branchExpanded === true;

        const ancestorIds: string[] = [];
        let currentId = persistedParentById.get(nodeId);
        while (currentId) {
            ancestorIds.unshift(currentId);
            currentId = persistedParentById.get(currentId);
        }

        ancestorIds.forEach((ancestorId) => {
            commands.expandBranch(ancestorId);
        });

        if (hasChildNodes && !branchExpanded) {
            commands.expandBranch(nodeId);
        }

        if (!isRadialLayout) {
            pendingRadialFocusNodeIdRef.current = nodeId;
            if (ancestorIds.length === 0 && (!hasChildNodes || !branchExpanded)) {
                focusNode(nodeId);
                pendingRadialFocusNodeIdRef.current = null;
            }
        }
    }, [
        commands,
        expandedBranchNodeIds,
        focusNode,
        isRadialLayout,
        persistedParentById,
        pendingRadialFocusNodeIdRef,
        radialOverviewNodeById,
        recordRecentClickedNode,
        selectedNodeIdsRef,
        setSelectedNodes,
    ]);

    const handleSelectRecentNode = useCallback((nodeId: string) => {
        setSelectedNodes([nodeId]);
        setActiveNode(nodeId);
        recordNodeUsed(nodeId);
        if (!isRadialLayout) {
            focusNode(nodeId);
        }
    }, [focusNode, isRadialLayout, recordNodeUsed, setActiveNode, setSelectedNodes]);

    return {
        handlePaneDoubleClick,
        handleSelectionChange,
        handleSelectionTyping,
        handleKeyNavigation,
        activateRadialNode,
        handleSelectRecentNode,
        isShiftMarqueeSelectionRef,
        suppressNextSelectionChangeRef,
        shiftMarqueeStartRef,
    };
}
