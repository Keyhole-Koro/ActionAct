"use client";

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import {
    Background,
    Edge,
    MiniMap,
    Node,
    ReactFlow,
    SelectionMode,
    useReactFlow,
    useViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphStore } from '@/features/graph/store';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { useStreamPreferencesStore } from '@/features/agentTools/store/stream-preferences-store';
import { CAMERA_CONFIG } from '@/services/camera/cameraService';
import { useGraphCommands } from '@/features/graph/hooks/useGraphCommands';
import { actDraftService } from '@/services/actDraft/firestore';

import { ActTreeGroupNode } from './ActTreeGroupNode';
import { BundledEdge } from './BundledEdge';
import { RadialOverview } from './RadialOverview';
import { SelectionHeaderNodeCard, SelectionOptionNodeCard } from './SelectionGroupNodes';
import { SelectedNodePanel } from './SelectedNodePanel';
import { FilePreviewPanel } from './FilePreviewPanel';
import { SearchBar } from './SearchBar';
import { GraphToolbar } from './GraphToolbar';
import { GraphNodeCardWithBoundary } from './graphCanvas/GraphNodeCardWithBoundary';
import { KeyboardShortcutsHint, NavControl } from './graphCanvas/GraphCanvasControls';
import { RecentClickedSelector } from './graphCanvas/RecentClickedSelector';
import { getDisplayNodeDimensions, readClientPoint } from './graphCanvas/graphCanvasUtils';
import type { GraphNodeBase, GraphNodeRender, PersistedNodeData } from '../types';

import { useGraphSubscriptions } from '../hooks/useGraphSubscriptions';
import { useLocalGraphState } from '../hooks/useLocalGraphState';
import { useGraphPresence } from '../hooks/useGraphPresence';
import { useGraphLayout } from '../hooks/useGraphLayout';
import { useGraphDisplayNodes } from '../hooks/useGraphDisplayNodes';
import { useGraphDisplayEdges } from '../hooks/useGraphDisplayEdges';
import { useGraphCamera } from '../hooks/useGraphCamera';
import { useGraphInteractions } from '../hooks/useGraphInteractions';

const edgeTypes = {
    bundled: BundledEdge,
};

const nodeTypes = {
    actTreeGroup: ActTreeGroupNode,
    customTask: GraphNodeCardWithBoundary,
    selectionHeader: SelectionHeaderNodeCard,
    selectionNode: SelectionOptionNodeCard,
};

export function GraphCanvas() {
    const {
        persistedNodes,
        persistedEdges,
        actNodes,
        actEdges,
        setSelectedNodes,
        setActiveNode,
        toggleExpandedNode,
        expandNode,
        expandBranchNode,
        clearAllFocus,
        addQueryActNode,
        addEmptyActNode,
        setPersistedGraph,
        setActGraph,
        activeNodeId,
        editingNodeId,
        selectedNodeIds,
        expandedNodeIds,
        expandedBranchNodeIds,
        streamingNodeIds,
        isStreaming,
        collapseUnusedNodes,
        recordNodeUsed,
        nodeLastUsedAt,
        nodeUseCount,
        updateActNodePosition,
    } = useGraphStore();
    const { workspaceId, isReadOnly } = useRunContextStore();
    const collapseThresholdMinutes = useStreamPreferencesStore((state) => state.collapseThresholdMinutes);
    const commands = useGraphCommands({ workspaceId });
    const reactFlowInstance = useReactFlow();
    const viewport = useViewport();
    const searchParams = useSearchParams();

    // Refs shared across hooks
    const selectedNodeIdsRef = useRef<string[]>(selectedNodeIds);
    const activeNodeIdRef = useRef<string | null>(activeNodeId);
    useLayoutEffect(() => {
        selectedNodeIdsRef.current = selectedNodeIds;
        activeNodeIdRef.current = activeNodeId;
    });

    const usePersistedGraphMock = useMemo(
        () => searchParams.get('graphMock') === '1',
        [searchParams],
    );

    // briefGeneratingNodeIds: act nodes with kind='brief' that haven't produced content yet
    const briefGeneratingNodeIds = useMemo(() => {
        const ids = new Set<string>();
        for (const actNode of actNodes as GraphNodeBase[]) {
            if (actNode.data?.kind !== 'brief') continue;
            if (actNode.data?.contentMd) continue;
            const refs = actNode.data?.referencedNodeIds;
            if (Array.isArray(refs) && typeof refs[0] === 'string') ids.add(refs[0]);
        }
        return ids;
    }, [actNodes]);

    // ── Hooks ────────────────────────────────────────────────────────────────

    useGraphSubscriptions({ effectiveWorkspaceId: usePersistedGraphMock ? 'ws-mock-public' : workspaceId, setPersistedGraph, setActGraph });

    const {
        recentClickedNodeIds,
        setRecentClickedNodeIds,
        customNodeSizes,
        recordRecentClickedNode,
        handleNodeResize,
    } = useLocalGraphState({ workspaceId });

    const {
        effectiveWorkspaceId,
        setLayoutMode,
        isRadialLayout,
        persistedGraph,
        radialOverviewGraph,
        fullActNodeDataById,
        actChildrenByParent,
        regularGraphNodes,
        selectionProjection,
        allReferenceableNodes,
        referenceableNodeById,
        persistedParentById,
        persistedRootIdByNode,
    } = useGraphLayout({
        persistedNodes: persistedNodes as Node<PersistedNodeData>[],
        persistedEdges: persistedEdges as Edge[],
        actNodes,
        actEdges,
        expandedNodeIds,
        expandedBranchNodeIds,
        workspaceId,
        usePersistedGraphMock,
    });

    // Filter recentClickedNodeIds to only known nodes
    React.useEffect(() => {
        if (referenceableNodeById.size === 0) return;
        setRecentClickedNodeIds((prev) => prev.filter((id) => referenceableNodeById.has(id)));
    }, [referenceableNodeById, setRecentClickedNodeIds]);

    const {
        emphasizedDisplayNodes,
        radialOverviewNodes,
        radialOverviewNodeById,
        actTreeGroupNodes,
    } = useGraphDisplayNodes({
        regularGraphNodes,
        selectionProjectionNodes: selectionProjection.nodes,
        selectedNodeIds,
        expandedBranchNodeIds,
        expandedNodeIds,
        editingNodeId,
        streamingNodeIds,
        activeNodeId,
        actNodes: actNodes as GraphNodeBase[],
        persistedGraph,
        radialOverviewGraph,
        allReferenceableNodes,
        fullActNodeDataById,
        actChildrenByParent,
        persistedRootIdByNode,
        isRadialLayout,
        nodeLastUsedAt,
        nodeUseCount,
        briefGeneratingNodeIds,
        customNodeSizes,
        effectiveWorkspaceId,
        workspaceId,
        commands,
        addQueryActNode,
        toggleExpandedNode,
        handleNodeResize,
    });

    const displayEdges = useGraphDisplayEdges({
        isRadialLayout,
        emphasizedDisplayNodes,
        actEdges,
        actChildrenByParent,
        selectionProjectionEdges: selectionProjection.edges,
        persistedGraph,
        persistedRootIdByNode,
        selectedNodeIds,
    });

    const {
        focusNode,
        focusActNode,
        handleWheel,
        pendingRadialFocusNodeIdRef,
    } = useGraphCamera({
        emphasizedDisplayNodes,
        actNodes: actNodes as GraphNodeBase[],
        setActiveNode,
        setSelectedNodes,
    });

    const {
        handlePaneDoubleClick,
        handleSelectionChange,
        activateRadialNode,
        handleSelectRecentNode,
        isShiftMarqueeSelectionRef,
        suppressNextSelectionChangeRef,
        shiftMarqueeStartRef,
    } = useGraphInteractions({
        isReadOnly,
        isRadialLayout,
        isStreaming,
        selectedNodeIds,
        selectedNodeIdsRef,
        activeNodeId,
        editingNodeId,
        actNodes: actNodes as GraphNodeBase[],
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
    });

    const { otherCursors, handleCursorMove } = useGraphPresence({ effectiveWorkspaceId });

    // ── JSX ──────────────────────────────────────────────────────────────────

    const layoutToggle = (
        <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-full border border-slate-200 bg-white/92 p-1 shadow-sm backdrop-blur-sm">
            <button
                type="button"
                className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                onClick={() => window.dispatchEvent(new CustomEvent('action:open-search'))}
            >
                <Search className="h-3.5 w-3.5" />
                <span>Search</span>
                <kbd className="ml-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">⌘F</kbd>
            </button>
        </div>
    );

    if (isRadialLayout) {
        return (
            <div className="relative h-full w-full" onDoubleClick={handlePaneDoubleClick}>
                {layoutToggle}
                <RecentClickedSelector
                    recentClickedNodeIds={recentClickedNodeIds}
                    referenceableNodeById={referenceableNodeById}
                    activeNodeId={activeNodeId}
                    onSelectNode={handleSelectRecentNode}
                />
                <RadialOverview
                    nodes={radialOverviewNodes as GraphNodeRender[]}
                    rootIds={radialOverviewGraph.rootIds}
                    depthById={radialOverviewGraph.depthById}
                    selectedNodeIds={selectedNodeIds}
                    onActivateNode={activateRadialNode}
                    onToggleBranch={commands.toggleBranch}
                />
            </div>
        );
    }

    return (
        <div className="relative h-full w-full" onWheel={handleWheel} onMouseMove={handleCursorMove}>
            {layoutToggle}
            <RecentClickedSelector
                recentClickedNodeIds={recentClickedNodeIds}
                referenceableNodeById={referenceableNodeById}
                activeNodeId={activeNodeId}
                onSelectNode={handleSelectRecentNode}
            />
            <SearchBar />
            <GraphToolbar />
            <SelectedNodePanel />
            <FilePreviewPanel />
            <KeyboardShortcutsHint />
            <div className="group absolute bottom-4 right-4 z-20 h-[400px] w-[480px] overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/88 shadow-lg backdrop-blur-sm transition-all duration-300 ease-out hover:h-[540px] hover:w-[680px]">
                <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-2">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Radial Overview</p>
                        <p className="text-xs text-slate-600">Hover to enlarge, drag to pan, hover segments to navigate</p>
                    </div>
                    <button
                        type="button"
                        className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100"
                        onClick={() => setLayoutMode('radial')}
                    >
                        Open full
                    </button>
                </div>
                <div className="h-[calc(100%-53px)]">
                    <RadialOverview
                        nodes={radialOverviewNodes as GraphNodeRender[]}
                        rootIds={radialOverviewGraph.rootIds}
                        depthById={radialOverviewGraph.depthById}
                        selectedNodeIds={selectedNodeIds}
                        onActivateNode={activateRadialNode}
                        onToggleBranch={commands.toggleBranch}
                        zoomBias={1.35}
                        compactMode
                    />
                </div>
            </div>
            <ReactFlow
                nodes={[...actTreeGroupNodes, ...emphasizedDisplayNodes] as GraphNodeRender[]}
                edges={displayEdges}
                onDoubleClick={handlePaneDoubleClick}
                defaultEdgeOptions={{
                    style: { stroke: '#475569', strokeWidth: 2, strokeOpacity: 0.72 },
                }}
                onlyRenderVisibleElements={false}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
                defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
                proOptions={{ hideAttribution: true }}
                onNodeClick={(event: React.MouseEvent, node: Node) => {
                    if (node.type === 'selectionHeader' || node.type === 'selectionNode') {
                        return;
                    }

                    recordRecentClickedNode(node.id);

                    const target = event.target;
                    if (
                        target instanceof HTMLElement
                        && target.closest('button, input, textarea, label, [role="button"], [data-stop-node-click="true"]')
                    ) {
                        return;
                    }

                    if (event.shiftKey) {
                        const currentIds = selectedNodeIdsRef.current;
                        const alreadySelected = currentIds.includes(node.id);
                        if (alreadySelected) {
                            const nextIds = currentIds.filter((selectedId) => selectedId !== node.id);
                            setSelectedNodes(nextIds);
                            setActiveNode(null);
                        } else {
                            setSelectedNodes([...currentIds, node.id]);
                            setActiveNode(node.id);
                        }
                        return;
                    }

                    const nodeKind = node.data?.kind as string | undefined;
                    const actStage = node.data?.actStage as string | undefined;
                    const hasStartedRun = node.data?.hasStartedRun === true;
                    const canAutoRunFromClick = nodeKind === 'suggestion' || (actStage === 'draft' && !hasStartedRun);
                    if (canAutoRunFromClick && !isStreaming) {
                        const query = ((node.data?.contentMd as string | undefined) || (node.data?.label as string | undefined) || '').trim();
                        if (query) {
                            void commands.runActFromNode(node.id, query);
                        }
                        return;
                    }

                    expandNode(node.id);
                    expandBranchNode(node.id);
                    recordNodeUsed(node.id);

                    if (activeNodeId !== node.id) {
                        focusNode(node.id);
                    }
                }}
                onNodeDoubleClick={(_event: React.MouseEvent, node: Node) => {
                    const currentZoom = reactFlowInstance.getZoom();
                    const nextZoom = Math.max(currentZoom, CAMERA_CONFIG.doubleClickZoomMin);
                    reactFlowInstance.setCenter(
                        node.position.x + CAMERA_CONFIG.nodeOffsetX,
                        node.position.y + CAMERA_CONFIG.nodeOffsetY,
                        { duration: CAMERA_CONFIG.doubleClickDuration, zoom: nextZoom },
                    );
                }}
                onSelectionChange={handleSelectionChange}
                onSelectionStart={(event: React.MouseEvent | React.TouchEvent) => {
                    const point = readClientPoint(event);
                    shiftMarqueeStartRef.current = point
                        ? reactFlowInstance.screenToFlowPosition({ x: point.x, y: point.y })
                        : null;
                    isShiftMarqueeSelectionRef.current = Boolean('shiftKey' in event && event.shiftKey);
                }}
                onSelectionEnd={(event: React.MouseEvent | React.TouchEvent) => {
                    if (isShiftMarqueeSelectionRef.current) {
                        const start = shiftMarqueeStartRef.current;
                        const endPoint = readClientPoint(event);
                        const end = endPoint
                            ? reactFlowInstance.screenToFlowPosition({ x: endPoint.x, y: endPoint.y })
                            : null;

                        if (start && end) {
                            const minX = Math.min(start.x, end.x);
                            const maxX = Math.max(start.x, end.x);
                            const minY = Math.min(start.y, end.y);
                            const maxY = Math.max(start.y, end.y);

                            const idsToRemove = emphasizedDisplayNodes
                                .filter((node) => node.type === 'customTask')
                                .filter((node) => {
                                    const { width, height } = getDisplayNodeDimensions(node as Node<Record<string, unknown>>);
                                    const nodeMinX = node.position.x;
                                    const nodeMaxX = node.position.x + width;
                                    const nodeMinY = node.position.y;
                                    const nodeMaxY = node.position.y + height;
                                    return !(nodeMaxX < minX || nodeMinX > maxX || nodeMaxY < minY || nodeMinY > maxY);
                                })
                                .map((node) => node.id);

                            if (idsToRemove.length > 0) {
                                const current = selectedNodeIdsRef.current;
                                const nextIds = current.filter((id) => !idsToRemove.includes(id));
                                if (nextIds.length !== current.length) {
                                    setSelectedNodes(nextIds);
                                }
                            }
                        }
                    }

                    shiftMarqueeStartRef.current = null;
                    suppressNextSelectionChangeRef.current = isShiftMarqueeSelectionRef.current;
                    isShiftMarqueeSelectionRef.current = false;
                }}
                onPaneClick={() => {
                    setActiveNode(null);
                }}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesDraggable={!isReadOnly}
                onNodeDragStop={(_event, node) => {
                    const isUserActRoot = node.type === 'customTask'
                        && node.data?.nodeSource === 'act'
                        && node.data?.createdBy === 'user'
                        && typeof node.data?.parentId !== 'string';
                    if (!workspaceId || !isUserActRoot) {
                        return;
                    }
                    updateActNodePosition(node.id, node.position);
                    void actDraftService.patchDraft(workspaceId, node.id, {
                        isManualPosition: true,
                        positionX: node.position.x,
                        positionY: node.position.y,
                    }).catch((error) => {
                        console.error('Failed to persist dragged act node position', { nodeId: node.id, error });
                    });
                }}
                panOnScroll
                panOnScrollSpeed={0.5}
                selectionOnDrag
                panOnDrag={[1, 2]}
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode="Meta"
                fitView
            >
                <Background color="var(--border)" gap={24} size={1} />
                <NavControl
                    actNodeIds={(actNodes as GraphNodeBase[]).map((n) => n.id)}
                    activeNodeId={activeNodeId}
                    onFocusActNode={focusActNode}
                />
                <MiniMap
                    className="!rounded-md !border-border/40 !bg-white !shadow-sm"
                    maskColor="rgba(0,0,0,0.05)"
                    nodeColor={() => 'var(--primary)'}
                />
            </ReactFlow>

            {/* Multiplayer cursors */}
            {otherCursors.map((user) => {
                if (!user.cursor) return null;
                const cssX = user.cursor.x * viewport.zoom + viewport.x;
                const cssY = user.cursor.y * viewport.zoom + viewport.y;
                const hue = user.uid.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % 360;
                const color = `hsl(${hue}, 70%, 50%)`;
                const displayName = user.displayName || 'Guest';

                return (
                    <div
                        key={user.uid}
                        className="pointer-events-none absolute top-0 left-0 z-50"
                        style={{
                            transform: `translate(${cssX}px, ${cssY}px)`,
                            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: 'rotate(-22deg)', transformOrigin: 'top left' }}>
                            <path
                                d="M0 0L16 6L6 16L0 0Z"
                                fill={color}
                                stroke="white"
                                strokeWidth="1.5"
                                strokeLinejoin="round"
                            />
                        </svg>
                        <div
                            className="ml-4 mt-1 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm"
                            style={{ backgroundColor: color }}
                        >
                            {user.photoURL && (
                                <img
                                    src={user.photoURL}
                                    alt=""
                                    className="h-3 w-3 rounded-full border border-white/40"
                                />
                            )}
                            {displayName}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
