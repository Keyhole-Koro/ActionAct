"use client";

import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    Background,
    Edge,
    MarkerType,
    MiniMap,
    Node,
    Panel,
    ReactFlow,
    SelectionMode,
    useReactFlow,
    useViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphCommands } from '@/features/graph/hooks/useGraphCommands';
import { useGraphStore } from '@/features/graph/store';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { useAgentInteractionStore } from '@/features/agentInteraction/store/interactionStore';
import { useStreamPreferencesStore } from '@/features/agentTools/store/stream-preferences-store';
import { projectSelectionGroups } from '@/features/agentInteraction/selectors/projectSelectionGroups';
import { actDraftService } from '@/services/actDraft/firestore';
import { organizeService } from '@/services/organize';
import {
    CAMERA_CONFIG,
    createSingleNodeFocusOptions,
    createFitViewOptions,
    getBoundingBoxForNodes,
} from '@/services/camera/cameraService';

import { BundledEdge } from './BundledEdge';
import { GraphNodeCard } from './GraphNodeCard';
import { RadialOverview } from './RadialOverview';
import { SelectionHeaderNodeCard, SelectionOptionNodeCard } from './SelectionGroupNodes';
import { SelectedNodePanel } from './SelectedNodePanel';
import {
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '../constants/nodeDimensions';
import { buildDisplayEdges, buildDisplayNodes } from '../selectors/projectGraph';
import { projectPersistedGraph } from '../selectors/projectPersistedGraph';
import { createPersistedGraphMockHundred } from '../mocks/persistedGraphMockHundred';
import type { GraphNodeBase, GraphNodeRender, PersistedNodeData } from '../types';
import { truncate } from '@/lib/string';

const RADIAL_ROOT_HUES = [198, 256, 148, 34, 320, 82, 12, 228];
const RECENT_CLICKED_NODE_LIMIT = 8;

class GraphNodeRenderBoundary extends React.Component<
    { children: React.ReactNode; nodeId?: string; label?: string },
    { hasError: boolean; errorMessage: string | null }
> {
    constructor(props: { children: React.ReactNode; nodeId?: string; label?: string }) {
        super(props);
        this.state = { hasError: false, errorMessage: null };
    }

    static getDerivedStateFromError(error: Error) {
        return {
            hasError: true,
            errorMessage: error instanceof Error ? error.message : String(error),
        };
    }

    componentDidCatch(error: Error) {
        console.error('[GraphNodeCard DEBUG] render error', {
            nodeId: this.props.nodeId,
            label: this.props.label,
            error,
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="w-[340px] rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive shadow-sm">
                    <div className="font-semibold">GraphNodeCard render failed</div>
                    <div className="mt-1 break-all">nodeId: {this.props.nodeId ?? 'unknown'}</div>
                    <div className="mt-1 break-all">label: {this.props.label ?? ''}</div>
                    <div className="mt-1 break-all">{this.state.errorMessage}</div>
                </div>
            );
        }
        return this.props.children;
    }
}

function GraphNodeCardWithBoundary(props: React.ComponentProps<typeof GraphNodeCard>) {
    const label = typeof props.data?.label === 'string' ? props.data.label : '';
    return (
        <GraphNodeRenderBoundary nodeId={props.id} label={label}>
            <GraphNodeCard {...props} />
        </GraphNodeRenderBoundary>
    );
}

const ZOOM_LEVELS = [0.4, 0.65, 1.0, 1.5] as const;

type NavControlProps = {
    actNodeIds: string[];
    activeNodeId: string | null;
    onFocusActNode: (nodeId: string) => void;
};

function NavControl({ actNodeIds, activeNodeId, onFocusActNode }: NavControlProps) {
    const { zoomTo, fitView } = useReactFlow();
    const { zoom } = useViewport();

    // ── Zoom ─────────────────────────────────────────────────────────────────
    const zoomIdx = ZOOM_LEVELS.reduce((best, level, idx) =>
        Math.abs(level - zoom) < Math.abs(ZOOM_LEVELS[best] - zoom) ? idx : best, 0);

    const zoomStep = (delta: 1 | -1) => {
        const next = Math.min(Math.max(zoomIdx + delta, 0), ZOOM_LEVELS.length - 1);
        zoomTo(ZOOM_LEVELS[next], { duration: 220 });
    };

    // ── Act node navigation ───────────────────────────────────────────────────
    const actIdx = actNodeIds.indexOf(activeNodeId ?? '');
    const hasAct = actNodeIds.length > 0;

    const focusAct = (delta: 1 | -1) => {
        if (!hasAct) return;
        const base = actIdx < 0 ? (delta === 1 ? -1 : actNodeIds.length) : actIdx;
        const next = (base + delta + actNodeIds.length) % actNodeIds.length;
        onFocusActNode(actNodeIds[next]);
    };

    const iconBtn = 'flex h-7 w-7 items-center justify-center rounded-md transition-colors';
    const activeBtn = `${iconBtn} text-slate-600 hover:bg-slate-100`;
    const disabledBtn = `${iconBtn} text-slate-300 cursor-default`;

    return (
        <Panel position="bottom-left" className="!m-3">
            <div className="flex flex-col items-center gap-0.5 rounded-lg border border-border/40 bg-white shadow-sm p-1 select-none">

                {/* Zoom in */}
                <button type="button" onClick={() => zoomStep(1)} disabled={zoomIdx >= ZOOM_LEVELS.length - 1}
                    className={zoomIdx >= ZOOM_LEVELS.length - 1 ? disabledBtn : activeBtn} title="Zoom in">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
                    </svg>
                </button>

                {/* Zoom level dots */}
                <div className="flex flex-col items-center gap-0.5 py-0.5">
                    {ZOOM_LEVELS.map((level, idx) => (
                        <button key={level} type="button" onClick={() => zoomTo(level, { duration: 220 })}
                            className={`h-1.5 w-1.5 rounded-full transition-all ${idx === zoomIdx ? 'bg-primary scale-125' : 'bg-slate-300 hover:bg-slate-400'}`}
                            title={`${Math.round(level * 100)}%`} />
                    ))}
                </div>

                {/* Zoom out */}
                <button type="button" onClick={() => zoomStep(-1)} disabled={zoomIdx <= 0}
                    className={zoomIdx <= 0 ? disabledBtn : activeBtn} title="Zoom out">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="1" y1="6" x2="11" y2="6"/>
                    </svg>
                </button>

                <div className="my-0.5 w-6 border-t border-border/40" />

                {/* Act node navigation — left / counter / right */}
                <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => focusAct(-1)} disabled={!hasAct}
                        className={!hasAct ? disabledBtn : activeBtn} title="Previous act node">
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="7,1 3,5 7,9"/>
                        </svg>
                    </button>
                    <span className="w-6 text-center text-[10px] font-medium text-slate-400 tabular-nums">
                        {hasAct ? `${actIdx >= 0 ? actIdx + 1 : '–'}/${actNodeIds.length}` : '–'}
                    </span>
                    <button type="button" onClick={() => focusAct(1)} disabled={!hasAct}
                        className={!hasAct ? disabledBtn : activeBtn} title="Next act node">
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3,1 7,5 3,9"/>
                        </svg>
                    </button>
                </div>

                <div className="my-0.5 w-6 border-t border-border/40" />

                {/* Fit view */}
                <button type="button" onClick={() => fitView({ duration: 300, padding: 0.12 })}
                    className={activeBtn} title="Fit view">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M1 5V2h3M15 5V2h-3M1 11v3h3M15 11v3h-3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
            </div>
        </Panel>
    );
}

const SHORTCUTS = [
    { keys: ['↑', '↓'],           desc: 'ズームイン / アウト' },
    { keys: ['←', '→'],           desc: 'Act ノード切り替え' },
    { keys: ['文字入力'],          desc: 'ノード選択中 → Act 作成' },
    { keys: ['クリック'],          desc: 'ノード展開 / フォーカス' },
    { keys: ['⌘', 'クリック'],    desc: '複数選択' },
    { keys: ['ダブルクリック'],    desc: 'ズームイン' },
    { keys: ['スクロール'],        desc: 'ズーム' },
    { keys: ['Space', 'ドラッグ'], desc: 'パン' },
] as const;

function KeyboardShortcutsHint() {
    return (
        <Panel position="bottom-right" className="!m-3">
            <div className="group relative flex flex-col items-end">
                {/* Expanded panel — visible on hover */}
                <div className="
                    mb-2 w-56 origin-bottom-right scale-95 rounded-xl border border-border/40
                    bg-white/95 backdrop-blur-sm shadow-lg
                    opacity-0 pointer-events-none
                    transition-all duration-200
                    group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto
                ">
                    <div className="px-3 pt-2.5 pb-1 border-b border-border/30">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                            Keyboard shortcuts
                        </p>
                    </div>
                    <ul className="px-3 py-2 flex flex-col gap-1.5">
                        {SHORTCUTS.map(({ keys, desc }, i) => (
                            <li key={i} className="flex items-center justify-between gap-3">
                                <span className="text-[11px] text-slate-500">{desc}</span>
                                <span className="flex items-center gap-0.5 shrink-0">
                                    {keys.map((k) => (
                                        <kbd key={k} className="
                                            inline-flex items-center justify-center rounded
                                            border border-slate-200 bg-slate-50
                                            px-1.5 py-0.5 text-[10px] font-medium
                                            text-slate-600 shadow-[0_1px_0_rgba(0,0,0,0.12)]
                                            leading-none whitespace-nowrap
                                        ">{k}</kbd>
                                    ))}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Trigger button */}
                <button
                    type="button"
                    className="
                        flex h-7 w-7 items-center justify-center rounded-full
                        border border-border/40 bg-white shadow-sm
                        text-[12px] font-semibold text-slate-400
                        hover:border-primary/30 hover:text-primary
                        transition-colors select-none
                    "
                    title="Keyboard shortcuts"
                >?</button>
            </div>
        </Panel>
    );
}

const edgeTypes = {
    bundled: BundledEdge,
};

const nodeTypes = {
    customTask: GraphNodeCardWithBoundary,
    selectionHeader: SelectionHeaderNodeCard,
    selectionNode: SelectionOptionNodeCard,
};

function isRenderableCoordinate(value: number | undefined) {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 20000;
}

function getDisplayNodeDimensions(node: Node<Record<string, unknown>>) {
    const data = (node.data ?? {}) as Partial<GraphNodeRender['data']>;

    if (data.layoutMode === 'radial' && data.nodeSource === 'persisted') {
        const radialDepth = typeof data.radialDepth === 'number' ? data.radialDepth : 0;
        const size = radialDepth === 0 ? 132 : (radialDepth === 1 ? 120 : (radialDepth === 2 ? 110 : 96));
        return { width: size, height: size };
    }

    const nodeKind = typeof data.kind === 'string' ? data.kind : undefined;
    const label = typeof data.label === 'string' ? data.label : undefined;
    const isExpanded = data.isExpanded === true;
    const hasChildNodes = data.hasChildNodes === true;
    const layoutDimensions = getLayoutDimensionsForNodeType(node.type, isExpanded, nodeKind);

    return {
        width: node.type === 'customTask'
            ? (isExpanded
                ? getExpandedNodeWidth(label, nodeKind)
                : getCollapsedNodeWidth(label, nodeKind, hasChildNodes))
            : layoutDimensions.width,
        height: layoutDimensions.height,
    };
}

function overlapsWithMargin(left: Node<Record<string, unknown>>, right: Node<Record<string, unknown>>, margin = 28) {
    const leftDimensions = getDisplayNodeDimensions(left);
    const rightDimensions = getDisplayNodeDimensions(right);

    return !(
        left.position.x + leftDimensions.width + margin < right.position.x - margin
        || left.position.x - margin > right.position.x + rightDimensions.width + margin
        || left.position.y + leftDimensions.height + margin < right.position.y - margin
        || left.position.y - margin > right.position.y + rightDimensions.height + margin
    );
}

function sameSortedIds(left: string[], right: string[]) {
    if (left.length !== right.length) {
        return false;
    }
    return left.every((id, index) => id === right[index]);
}

function readClientPoint(event: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): { x: number; y: number } | null {
    const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event;

    if ('touches' in nativeEvent) {
        const touch = nativeEvent.touches[0] ?? nativeEvent.changedTouches[0];
        if (!touch) {
            return null;
        }
        return { x: touch.clientX, y: touch.clientY };
    }

    if ('clientX' in nativeEvent && 'clientY' in nativeEvent) {
        return { x: nativeEvent.clientX, y: nativeEvent.clientY };
    }

    return null;
}

type NodeSide = 'left' | 'right' | 'top' | 'bottom';

function oppositeSide(side: NodeSide): NodeSide {
    if (side === 'left') return 'right';
    if (side === 'right') return 'left';
    if (side === 'top') return 'bottom';
    return 'top';
}

function resolveNearestSides(sourceNode: Node<Record<string, unknown>>, targetNode: Node<Record<string, unknown>>) {
    const sourceDimensions = getDisplayNodeDimensions(sourceNode);
    const targetDimensions = getDisplayNodeDimensions(targetNode);

    const sourceCenterX = sourceNode.position.x + (sourceDimensions.width / 2);
    const sourceCenterY = sourceNode.position.y + (sourceDimensions.height / 2);
    const targetCenterX = targetNode.position.x + (targetDimensions.width / 2);
    const targetCenterY = targetNode.position.y + (targetDimensions.height / 2);

    const deltaX = targetCenterX - sourceCenterX;
    const deltaY = targetCenterY - sourceCenterY;
    const useHorizontal = Math.abs(deltaX) >= Math.abs(deltaY);

    const sourceSide: NodeSide = useHorizontal
        ? (deltaX >= 0 ? 'right' : 'left')
        : (deltaY >= 0 ? 'bottom' : 'top');

    return {
        sourceSide,
        targetSide: oppositeSide(sourceSide),
    };
}

export function GraphCanvas() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
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
        addOrUpdateActNode,
        addQueryActNode,
        addEmptyActNode,
        removeActNode,
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
    } = useGraphStore();
    const { workspaceId, topicId } = useRunContextStore();
    const autoRouteEdgeHandles = useStreamPreferencesStore((state) => state.autoRouteEdgeHandles);
    const setStreamPreferences = useStreamPreferencesStore((state) => state.setPreferences);
    const selectionGroups = useAgentInteractionStore((state) => state.groups);
    const toggleSelectionOption = useAgentInteractionStore((state) => state.toggleOptionSelection);
    const confirmSelection = useAgentInteractionStore((state) => state.confirmSelection);
    const clearSelectionGroup = useAgentInteractionStore((state) => state.clearSelection);
    const cancelSelectionGroup = useAgentInteractionStore((state) => state.cancelGroup);
    const commands = useGraphCommands({ workspaceId, topicId });
    const reactFlowInstance = useReactFlow();

    const setPersistedGraphRef = useRef(setPersistedGraph);
    const persistedNodeCountRef = useRef(0);
    const previousViewSignatureRef = useRef<string | null>(null);
    const needsPostStreamFitRef = useRef(false);
    const activeNodeIdRef = useRef(activeNodeId);
    const pendingRadialFocusNodeIdRef = useRef<string | null>(null);
    const selectedNodeIdsRef = useRef<string[]>(selectedNodeIds);
    const isShiftMarqueeSelectionRef = useRef(false);
    const shiftMarqueeStartRef = useRef<{ x: number; y: number } | null>(null);
    const selectionComposerNodeIdRef = useRef<string | null>(null);
    const [recentClickedNodeIds, setRecentClickedNodeIds] = React.useState<string[]>([]);
    useLayoutEffect(() => {
        selectedNodeIdsRef.current = selectedNodeIds;
        activeNodeIdRef.current = activeNodeId;
    });
    const usePersistedGraphMock = useMemo(() => {
        return searchParams.get('graphMock') === '1';
    }, [searchParams]);
    const persistedLayoutMode = useMemo(() => {
        const layout = searchParams.get('layout');
        if (layout === 'radial') return 'radial' as const;
        if (layout === 'orbit') return 'orbit' as const;
        return 'force' as const;
    }, [searchParams]);

    useEffect(() => {
        setPersistedGraphRef.current = setPersistedGraph;
    }, [setPersistedGraph]);

    useEffect(() => {
        if (usePersistedGraphMock) {
            const mock = createPersistedGraphMockHundred(topicId);
            persistedNodeCountRef.current = mock.nodes.length;
            setPersistedGraphRef.current(mock.nodes, mock.edges);
            return;
        }

        const unsubscribe = organizeService.subscribeTree(workspaceId, topicId, (topicNodes) => {
            const nextPersistedNodes: Node<PersistedNodeData>[] = topicNodes.map((node, index) => ({
                id: node.id,
                type: 'customTask',
                position: { x: 120, y: index * 180 + 80 },
                data: {
                    nodeSource: 'persisted',
                    createdBy: node.createdBy,
                    topicId: node.topicId,
                    label: node.title,
                    kind: node.kind,
                    contextSummary: node.contextSummary,
                    detailHtml: node.detailHtml,
                    contentMd: node.contentMd,
                    evidenceRefs: node.evidenceRefs,
                    parentId: node.parentId,
                    referencedNodeIds: node.referencedNodeIds,
                },
            }));

            const nextPersistedEdges: Edge[] = topicNodes
                .filter((node) => node.parentId)
                .map((node) => ({
                    id: `e-${node.parentId}-${node.id}`,
                    source: node.parentId!,
                    target: node.id,
                    animated: true,
                }));

            if (nextPersistedNodes.length === 0 && persistedNodeCountRef.current > 0) {
                return;
            }
            persistedNodeCountRef.current = nextPersistedNodes.length;
            setPersistedGraphRef.current(nextPersistedNodes, nextPersistedEdges);
        });

        return () => unsubscribe();
    }, [topicId, usePersistedGraphMock, workspaceId]);

    useEffect(() => {
        const unsubscribe = actDraftService.subscribeDrafts(workspaceId, topicId, (draftNodes) => {
            const draftActNodes: GraphNodeBase[] = draftNodes.map((node, index) => ({
                id: node.id,
                type: 'customTask',
                position: { x: 420, y: index * 180 + 120 },
                data: {
                    nodeSource: 'act',
                    createdBy: node.createdBy ?? 'agent',
                    topicId: node.topicId ?? topicId,
                    label: node.title,
                    kind: 'act',
                    contentMd: node.contentMd,
                    contextSummary: node.contextSummary,
                    detailHtml: node.detailHtml,
                    referencedNodeIds: node.referencedNodeIds,
                },
            }));
            const graphState = useGraphStore.getState();
            const draftNodeIds = new Set(draftActNodes.map((node) => node.id));
            const preservedLiveNodes = graphState.actNodes.filter((node) => {
                if (draftNodeIds.has(node.id)) {
                    return false;
                }
                return graphState.streamingNodeIds.includes(node.id) || graphState.editingNodeId === node.id;
            });
            const nextActNodes = [...draftActNodes, ...preservedLiveNodes];
            const nextActEdges: Edge[] = nextActNodes.flatMap((node) => {
                const referencedNodeIds = Array.isArray(node.data?.referencedNodeIds)
                    ? node.data.referencedNodeIds.filter((value): value is string => typeof value === 'string' && value !== node.id)
                    : [];
                return referencedNodeIds.map((sourceId) => ({
                    id: `edge-ctx-${sourceId}-${node.id}`,
                    source: sourceId,
                    target: node.id,
                    animated: true,
                    style: { stroke: '#888', strokeDasharray: '5,5' },
                }));
            });
            setActGraph(nextActNodes, nextActEdges);
        });

        return () => unsubscribe();
    }, [setActGraph, topicId, workspaceId]);

    const effectiveExpandedBranchNodeIds = useMemo(() => {
        // We no longer force root nodes to be expanded by default.
        // Only nodes explicitly toggled by the user (expandedBranchNodeIds) will be open.
        return expandedBranchNodeIds;
    }, [expandedBranchNodeIds]);

    // Defer layout-heavy inputs so user interactions (expand/collapse clicks)
    // are rendered immediately while the force simulation runs in a background pass.
    const deferredExpandedBranchNodeIds = useDeferredValue(effectiveExpandedBranchNodeIds);
    const deferredExpandedNodeIds = useDeferredValue(expandedNodeIds);

    // Strip act nodes down to layout-relevant fields only (position + refs + label).
    // This prevents streaming content updates (contentMd, contextSummary, etc.) from
    // triggering an expensive force layout recomputation on every streaming tick.
    const actNodesLayoutKey = (actNodes as GraphNodeBase[]).map((n) =>
        `${n.id}:${n.position.x.toFixed(0)},${n.position.y.toFixed(0)}:${n.data?.label ?? ''}:${(n.data?.referencedNodeIds as string[] | undefined)?.join(',') ?? ''}`
    ).join('|');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const actNodesForLayout = useMemo(() => (actNodes as GraphNodeBase[]).map((n) => ({
        ...n,
        data: {
            kind: n.data?.kind,
            nodeSource: n.data?.nodeSource,
            label: n.data?.label,
            referencedNodeIds: n.data?.referencedNodeIds,
            parentId: n.data?.parentId,
            isManualPosition: n.data?.isManualPosition,
        },
    } as GraphNodeBase)), [actNodesLayoutKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const deferredActNodes = useDeferredValue(actNodesForLayout);
    const deferredActEdges = useDeferredValue(actEdges);

    const persistedGraph = useMemo(
        () => projectPersistedGraph(
            persistedNodes as GraphNodeBase[],
            persistedEdges,
            deferredExpandedBranchNodeIds,
            deferredExpandedNodeIds,
            persistedLayoutMode,
            deferredActNodes,
            deferredActEdges,
        ),
        [deferredActEdges, deferredActNodes, deferredExpandedBranchNodeIds, deferredExpandedNodeIds, persistedEdges, persistedLayoutMode, persistedNodes],
    );
    const isRadialLayout = persistedLayoutMode === 'radial';
    const radialOverviewGraph = useMemo(
        () => projectPersistedGraph(
            persistedNodes as GraphNodeBase[],
            persistedEdges,
            effectiveExpandedBranchNodeIds,
            expandedNodeIds,
            'radial',
        ),
        [effectiveExpandedBranchNodeIds, expandedNodeIds, persistedEdges, persistedNodes],
    );

    const regularGraphNodes = useMemo(
        () => persistedGraph.positionedNodes,
        [persistedGraph.positionedNodes],
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

    const recordRecentClickedNode = useCallback((nodeId: string) => {
        setRecentClickedNodeIds((previous) => [
            nodeId,
            ...previous.filter((id) => id !== nodeId),
        ].slice(0, RECENT_CLICKED_NODE_LIMIT));
    }, []);

    useEffect(() => {
        setRecentClickedNodeIds((previous) => previous.filter((id) => referenceableNodeById.has(id)));
    }, [referenceableNodeById]);

    const displayNodes = useMemo(
        () => buildDisplayNodes({
            nodes: regularGraphNodes,
            selectedNodeIds,
            expandedBranchNodeIds,
            visiblePersistedNodeIds: persistedGraph.visibleNodeIds,
            childrenByParent: persistedGraph.childrenByParent,
            allReferenceableNodes,
            isNodeExpanded: (nodeId) => expandedNodeIds.includes(nodeId),
            isNodeEditing: (nodeId) => editingNodeId === nodeId,
            isNodeStreaming: (nodeId) => streamingNodeIds.includes(nodeId),
            onToggleBranch: commands.toggleBranch,
            onOpenDetails: commands.openDetails,
            onOpenReferencedNode: commands.openReferencedNode,
            onCommitLabel: (nodeId, label) => {
                void commands.commitActNodeLabel(nodeId, label);
            },
            onRunAction: commands.runActFromNode,
            onAddMedia: (nodeId, file) => commands.addMediaContext(nodeId, file),
        }),
        [
            allReferenceableNodes,
            commands,
            editingNodeId,
            expandedBranchNodeIds,
            expandedNodeIds,
            persistedGraph.childrenByParent,
            persistedGraph.visibleNodeIds,
            regularGraphNodes,
            selectedNodeIds,
            streamingNodeIds,
        ],
    );

    const canvasNodes = useMemo(
        () => [...displayNodes, ...selectionProjection.nodes],
        [displayNodes, selectionProjection.nodes],
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

    const layoutAwareDisplayNodes = useMemo(() => {
        const now = Date.now();
        // Half-life for recency decay: 20 minutes
        const RECENCY_HALF_LIFE_MS = 20 * 60 * 1000;
        // Frequency saturation constant: K uses → 50% frequency score
        const FREQ_K = 4;

        return canvasNodes.map((node) => {
            const layoutMode: 'force' | 'radial' = isRadialLayout && node.data?.nodeSource === 'persisted'
                ? 'radial'
                : 'force';

            let rootHue = 210;
            if (node.data?.nodeSource === 'persisted') {
                const rootId = persistedRootIdByNode.get(node.id);
                const rootIndex = rootId ? persistedGraph.rootIds.indexOf(rootId) : -1;
                rootHue = rootIndex >= 0 ? RADIAL_ROOT_HUES[rootIndex % RADIAL_ROOT_HUES.length] : 210;
            }

            // Activity opacity: only applied to act nodes.
            // New nodes (no usage recorded yet) stay at full opacity.
            let activityOpacity: number | undefined;
            if (node.data?.nodeSource === 'act') {
                const lastUsed = nodeLastUsedAt[node.id];
                const count = nodeUseCount[node.id] ?? 0;
                if (lastUsed !== undefined) {
                    const recencyScore = Math.exp(-(now - lastUsed) / RECENCY_HALF_LIFE_MS);
                    const freqScore = count / (count + FREQ_K);
                    const activity = 0.5 * recencyScore + 0.5 * freqScore;
                    // Map [0, 1] → [0.25, 1.0] so even unused nodes remain visible
                    activityOpacity = 0.25 + 0.75 * activity;
                }
            }

            return {
                ...node,
                data: {
                    ...node.data,
                    layoutMode,
                    radialDepth: persistedGraph.depthById.get(node.id) ?? 0,
                    rootHue,
                    ...(activityOpacity !== undefined ? { activityOpacity } : {}),
                },
            };
        });
    }, [canvasNodes, isRadialLayout, nodeLastUsedAt, nodeUseCount, persistedGraph.depthById, persistedGraph.rootIds, persistedRootIdByNode]);

    const radialOverviewNodes = useMemo(
        () => buildDisplayNodes({
            nodes: radialOverviewGraph.positionedNodes,
            selectedNodeIds,
            expandedBranchNodeIds,
            visiblePersistedNodeIds: radialOverviewGraph.visibleNodeIds,
            childrenByParent: radialOverviewGraph.childrenByParent,
            allReferenceableNodes: radialOverviewGraph.positionedNodes,
            isNodeExpanded: (nodeId) => expandedNodeIds.includes(nodeId),
            isNodeEditing: (nodeId) => editingNodeId === nodeId,
            isNodeStreaming: (nodeId) => streamingNodeIds.includes(nodeId),
            onToggleBranch: commands.toggleBranch,
            onOpenDetails: commands.openDetails,
            onOpenReferencedNode: commands.openReferencedNode,
            onCommitLabel: (nodeId, label) => {
                void commands.commitActNodeLabel(nodeId, label);
            },
            onRunAction: commands.runActFromNode,
            onAddMedia: (nodeId, file) => commands.addMediaContext(nodeId, file),
        }).map((node) => ({
            ...node,
            data: {
                ...node.data,
                layoutMode: 'radial' as const,
                radialDepth: radialOverviewGraph.depthById.get(node.id) ?? 0,
            },
        })),
        [
            commands,
            editingNodeId,
            expandedBranchNodeIds,
            expandedNodeIds,
            radialOverviewGraph.childrenByParent,
            radialOverviewGraph.depthById,
            radialOverviewGraph.positionedNodes,
            radialOverviewGraph.visibleNodeIds,
            selectedNodeIds,
            streamingNodeIds,
        ],
    );

    const radialOverviewNodeById = useMemo(
        () => new Map(radialOverviewNodes.map((node) => [node.id, node])),
        [radialOverviewNodes],
    );

    useEffect(() => {
        const composerId = selectionComposerNodeIdRef.current;
        if (composerId && !actNodes.some((node) => node.id === composerId)) {
            selectionComposerNodeIdRef.current = null;
        }

        const contextNodeIds = [...new Set(selectedNodeIds.filter((id) => id !== selectionComposerNodeIdRef.current))].sort();

        if (contextNodeIds.length === 0) {
            const currentComposerId = selectionComposerNodeIdRef.current;
            if (!currentComposerId) {
                return;
            }
            const composerNode = actNodes.find((node) => node.id === currentComposerId);
            const hasLabel = typeof composerNode?.data?.label === 'string' && composerNode.data.label.trim().length > 0;
            const hasResolvedContent = [
                composerNode?.data?.contentMd,
                composerNode?.data?.contextSummary,
                composerNode?.data?.detailHtml,
                composerNode?.data?.thoughtMd,
            ].some((value) => typeof value === 'string' && value.trim().length > 0);

            if (composerNode && !hasLabel && !hasResolvedContent) {
                removeActNode(currentComposerId);
            }
            selectionComposerNodeIdRef.current = null;
            return;
        }

        const currentComposerId = selectionComposerNodeIdRef.current;
        if (currentComposerId) {
            const composerNode = actNodes.find((node) => node.id === currentComposerId);
            if (!composerNode) {
                selectionComposerNodeIdRef.current = null;
                return;
            }

            const hasLabel = typeof composerNode.data?.label === 'string' && composerNode.data.label.trim().length > 0;
            const hasResolvedContent = [
                composerNode.data?.contentMd,
                composerNode.data?.contextSummary,
                composerNode.data?.detailHtml,
                composerNode.data?.thoughtMd,
            ].some((value) => typeof value === 'string' && value.trim().length > 0);

            if (hasLabel || hasResolvedContent) {
                selectionComposerNodeIdRef.current = null;
                return;
            }

            const currentReferenced = Array.isArray(composerNode.data?.referencedNodeIds)
                ? composerNode.data.referencedNodeIds.filter((value): value is string => typeof value === 'string').sort()
                : [];
            if (!sameSortedIds(currentReferenced, contextNodeIds)) {
                addOrUpdateActNode(currentComposerId, { referencedNodeIds: contextNodeIds, kind: 'act', createdBy: 'user' });
            }
            return;
        }

        const contextNodes = regularGraphNodes.filter((node) => contextNodeIds.includes(node.id));
        if (contextNodes.length === 0) {
            return;
        }

        const maxRightX = contextNodes.reduce((max, node) => {
            const { width } = getDisplayNodeDimensions(node as GraphNodeRender);
            return Math.max(max, node.position.x + width);
        }, contextNodes[0].position.x);
        const averageY = contextNodes.reduce((sum, node) => sum + node.position.y, 0) / contextNodes.length;
        const composerNodeId = addQueryActNode({ x: maxRightX + 220, y: averageY }, '');
        selectionComposerNodeIdRef.current = composerNodeId;
        addOrUpdateActNode(composerNodeId, { referencedNodeIds: contextNodeIds, kind: 'act', createdBy: 'user' });
    }, [actNodes, addOrUpdateActNode, addQueryActNode, regularGraphNodes, removeActNode, selectedNodeIds]);

    const normalizedDisplayNodes = useMemo(() => {
        const safeDisplayNodes = layoutAwareDisplayNodes.map((node, index) => {
            const x = node.position?.x;
            const y = node.position?.y;
            if (isRenderableCoordinate(x) && isRenderableCoordinate(y)) {
                return node;
            }
            return {
                ...node,
                position: {
                    x: 120 + ((index % 4) * 360),
                    y: 100 + (Math.floor(index / 4) * 220),
                },
            };
        });

        if (safeDisplayNodes.length === 0) {
            return safeDisplayNodes;
        }

        const minX = Math.min(...safeDisplayNodes.map((node) => node.position.x));
        const minY = Math.min(...safeDisplayNodes.map((node) => node.position.y));
        const offsetX = minX < 120 ? 120 - minX : 0;
        const offsetY = minY < 100 ? 100 - minY : 0;

        if (offsetX === 0 && offsetY === 0) {
            return safeDisplayNodes;
        }

        return safeDisplayNodes.map((node) => ({
            ...node,
            position: {
                x: node.position.x + offsetX,
                y: node.position.y + offsetY,
            },
        }));
    }, [layoutAwareDisplayNodes]);

    const emphasizedDisplayNodes = useMemo(() => {
        const isExpandedNode = (node: (typeof normalizedDisplayNodes)[number]) => (
            node.type === 'customTask'
            && typeof node.data === 'object'
            && node.data !== null
            && 'isExpanded' in node.data
            && node.data.isExpanded === true
        );

        const expandedNodes = normalizedDisplayNodes.filter((node) => isExpandedNode(node));
        if (expandedNodes.length === 0) {
            return normalizedDisplayNodes;
        }

        return normalizedDisplayNodes.map((node) => {
            if (node.type !== 'customTask') {
                return node;
            }
            const isExpanded = isExpandedNode(node);
            const isSelected = selectedNodeIds.includes(node.id);
            const overlapsExpanded = !isExpanded && expandedNodes.some((expandedNode) => (
                expandedNode.id !== node.id && overlapsWithMargin(node, expandedNode)
            ));

            return {
                ...node,
                zIndex: isExpanded ? 120 : (isSelected ? 110 : (overlapsExpanded ? 30 : 80)),
                style: {
                    ...(node.style ?? {}),
                    opacity: overlapsExpanded && !isSelected ? 0.4 : 1,
                },
            };
        });
    }, [normalizedDisplayNodes, selectedNodeIds]);


    const persistedParentById = useMemo(
        () => new Map(
            persistedNodes.map((node) => [
                node.id,
                typeof node.data?.parentId === 'string' ? node.data.parentId : undefined,
            ]),
        ),
        [persistedNodes],
    );

    const displayEdges = useMemo(
        () => {
            if (isRadialLayout) {
                return [];
            }

            const nodeById = new Map(emphasizedDisplayNodes.map((node) => [node.id, node]));

            // Precompute per-cluster centroids for edge bundling
            const clusterPoints = new Map<string, { x: number; y: number }[]>();
            for (const [nodeId, rootId] of persistedRootIdByNode) {
                const node = nodeById.get(nodeId);
                if (!node) continue;
                const pts = clusterPoints.get(rootId) ?? [];
                pts.push(node.position);
                clusterPoints.set(rootId, pts);
            }
            const clusterCentroids = new Map<string, { x: number; y: number }>();
            for (const [rootId, pts] of clusterPoints) {
                clusterCentroids.set(rootId, {
                    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
                    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
                });
            }

            return buildDisplayEdges(
                [...persistedGraph.hierarchyEdges, ...persistedGraph.relationEdges],
                [...actEdges, ...selectionProjection.edges],
            ).map((edge) => {
            const sourceNode = nodeById.get(edge.source);
            const targetNode = nodeById.get(edge.target);
            const isActContext = edge.id.startsWith('edge-ctx-');
            const isRelation = 'relationType' in edge && edge.relationType === 'related';
            const isActContextFocused = isActContext
                && (selectedNodeIds.includes(edge.source) || selectedNodeIds.includes(edge.target));
            const isRelationFocused = isRelation
                && (selectedNodeIds.includes(edge.source) || selectedNodeIds.includes(edge.target));
            const sourceRootId = persistedRootIdByNode.get(edge.source);
            const targetRootId = persistedRootIdByNode.get(edge.target);
            const rootId = sourceRootId ?? targetRootId;
            const rootIndex = rootId ? persistedGraph.rootIds.indexOf(rootId) : -1;
            const rootHue = rootIndex >= 0
                ? RADIAL_ROOT_HUES[rootIndex % RADIAL_ROOT_HUES.length]
                : 210;
            const sourceDepth = persistedGraph.depthById.get(edge.source) ?? persistedGraph.depthById.get(edge.target) ?? 0;
            const hierarchyStroke = `hsla(${rootHue} 70% ${Math.min(54 + (sourceDepth * 5), 72)}% / 1)`;
            const relationStroke = `hsla(${rootHue} 56% ${Math.min(68 + (sourceDepth * 3), 82)}% / 1)`;
            const nearestSides = autoRouteEdgeHandles && sourceNode && targetNode && sourceNode.type === 'customTask' && targetNode.type === 'customTask'
                ? resolveNearestSides(sourceNode as Node<Record<string, unknown>>, targetNode as Node<Record<string, unknown>>)
                : null;

            // Bundle point for cross-cluster relation edges
            const isCrossCluster = isRelation && sourceRootId && targetRootId && sourceRootId !== targetRootId;
            const bundlePoint = isCrossCluster
                ? (() => {
                    const sc = clusterCentroids.get(sourceRootId!);
                    const tc = clusterCentroids.get(targetRootId!);
                    if (!sc || !tc) return undefined;
                    return { x: (sc.x + tc.x) / 2, y: (sc.y + tc.y) / 2 };
                })()
                : undefined;

            return {
                ...edge,
                sourceHandle: nearestSides ? `source-${nearestSides.sourceSide}` : (edge as Edge).sourceHandle,
                targetHandle: nearestSides ? `target-${nearestSides.targetSide}` : (edge as Edge).targetHandle,
                type: isActContext ? 'simplebezier' : (bundlePoint ? 'bundled' : (isRelation ? 'smoothstep' : 'default')),
                zIndex: isActContext ? 70 : (isRelationFocused ? 55 : (isRelation ? 40 : 60)),
                interactionWidth: isActContext ? 32 : 24,
                markerEnd: isActContext
                    ? {
                        type: MarkerType.ArrowClosed,
                        width: 18,
                        height: 18,
                        color: isActContextFocused ? '#0f766e' : '#64748b',
                    }
                    : undefined,
                label: isActContextFocused ? 'context' : undefined,
                labelStyle: isActContextFocused ? { fill: '#0f766e', fontSize: 11, fontWeight: 600 } : undefined,
                labelBgStyle: isActContextFocused ? { fill: 'rgba(248, 250, 252, 0.92)', fillOpacity: 1 } : undefined,
                labelBgPadding: isActContextFocused ? [6, 3] as [number, number] : undefined,
                labelBgBorderRadius: isActContextFocused ? 6 : undefined,
                data: bundlePoint ? { bundlePoint } : undefined,
                style: {
                    stroke: isActContext
                        ? (isActContextFocused ? '#0f766e' : '#64748b')
                        : (isRelation
                            ? (isRelationFocused ? hierarchyStroke : relationStroke)
                            : hierarchyStroke),
                    strokeWidth: isActContext
                        ? (isActContextFocused ? 2.1 : 1.4)
                        : (isRelation ? (isRelationFocused ? 2.2 : 1.6) : 3),
                    strokeOpacity: isActContext
                        ? (isActContextFocused ? 0.9 : 0.46)
                        : (isRelation ? (isRelationFocused ? 0.72 : 0.34) : 1),
                    strokeDasharray: isActContext ? '6 4' : (isRelation ? '7 5' : undefined),
                    ...((edge as Edge).style ?? {}),
                },
            };
            });
        },
        [
            actEdges,
            autoRouteEdgeHandles,
            emphasizedDisplayNodes,
            isRadialLayout,
            persistedGraph.depthById,
            persistedGraph.hierarchyEdges,
            persistedGraph.relationEdges,
            persistedGraph.rootIds,
            persistedRootIdByNode,
            selectedNodeIds,
            selectionProjection.edges,
        ],
    );

    const focusNode = useCallback((nodeId: string) => {
        const targetNode = emphasizedDisplayNodes.find((node) => node.id === nodeId)
            ?? (actNodes as GraphNodeBase[]).find((node) => node.id === nodeId);
        if (!targetNode) {
            return;
        }

        setActiveNode(targetNode.id);
        const currentZoom = reactFlowInstance.getZoom();
        const animationOptions = createSingleNodeFocusOptions(currentZoom);
        reactFlowInstance.setCenter(
            targetNode.position.x + CAMERA_CONFIG.nodeOffsetX,
            targetNode.position.y + CAMERA_CONFIG.nodeOffsetY,
            { duration: animationOptions.duration, zoom: animationOptions.zoom },
        );
    }, [emphasizedDisplayNodes, actNodes, reactFlowInstance, setActiveNode]);

    const focusActNode = useCallback((nodeId: string) => {
        setSelectedNodes([nodeId]);
        focusNode(nodeId);
    }, [focusNode, setSelectedNodes]);

    const handlePaneDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const pane = target.closest('.react-flow__pane');
        const node = target.closest('.react-flow__node');
        const control = target.closest('button, input, textarea, [role="button"]');
        if (!pane || node || control) {
            return;
        }

        const flowPosition = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });
        addEmptyActNode(flowPosition);
    }, [addEmptyActNode, reactFlowInstance]);

    const viewSignature = useMemo(
        () => JSON.stringify({
            nodeIds: emphasizedDisplayNodes.map((node) => node.id),
            edgeIds: displayEdges.map((edge) => edge.id),
        }),
        [displayEdges, emphasizedDisplayNodes],
    );

    /*
    useEffect(() => {
        if (emphasizedDisplayNodes.length === 0) {
            previousViewSignatureRef.current = null;
            return;
        }

        if (viewSignature === previousViewSignatureRef.current) {
            return;
        }
        previousViewSignatureRef.current = viewSignature;

        if (isStreaming) {
            needsPostStreamFitRef.current = true;
            return;
        }

        needsPostStreamFitRef.current = false;
        const timeoutId = window.setTimeout(() => {
            reactFlowInstance.fitView({
                duration: CAMERA_CONFIG.fitViewDuration,
                padding: CAMERA_CONFIG.fitViewPadding,
                minZoom: CAMERA_CONFIG.fitViewZoomMin,
                maxZoom: CAMERA_CONFIG.fitViewZoomMax,
            });
        }, 50);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [emphasizedDisplayNodes.length, isStreaming, reactFlowInstance, viewSignature]);
    */

    /*
    // ストリーミング終了後に一度だけ fitView を実行
    useEffect(() => {
        if (isStreaming || !needsPostStreamFitRef.current) {
            return;
        }
        needsPostStreamFitRef.current = false;
        const timeoutId = window.setTimeout(() => {
            reactFlowInstance.fitView({
                duration: CAMERA_CONFIG.fitViewDuration,
                padding: CAMERA_CONFIG.fitViewPadding,
                minZoom: CAMERA_CONFIG.fitViewZoomMin,
                maxZoom: CAMERA_CONFIG.fitViewZoomMax,
            });
        }, 100);
        return () => window.clearTimeout(timeoutId);
    }, [isStreaming, reactFlowInstance]);
    */

    useEffect(() => {
        const pendingNodeId = pendingRadialFocusNodeIdRef.current;
        if (!pendingNodeId) {
            return;
        }

        if (!emphasizedDisplayNodes.some((node) => node.id === pendingNodeId)) {
            return;
        }

        pendingRadialFocusNodeIdRef.current = null;
        focusNode(pendingNodeId);
    }, [emphasizedDisplayNodes, focusNode]);

    const handleSelectionChange = useCallback(({ nodes: changedNodes }: { nodes: Node[] }) => {
        if (isShiftMarqueeSelectionRef.current) {
            return;
        }
        const ids = changedNodes
            .filter((n) => n.type === 'customTask' || n.type == null)
            .map((n) => n.id)
            .sort();
        const current = [...selectedNodeIdsRef.current].sort();
        if (ids.length === current.length && ids.every((id, i) => id === current[i])) {
            return;
        }
        setSelectedNodes(ids);
    }, [setSelectedNodes]);

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
        addQueryActNode({ x: averageX, y: maxY + 240 }, event.key);
        event.preventDefault();
    }, [addQueryActNode, editingNodeId, emphasizedDisplayNodes, selectedNodeIds]);

    const handleKeyNavigation = useCallback((event: KeyboardEvent) => {
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

        // ↑ / ↓ — zoom in / out through preset levels
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

        // ← / → — cycle through act nodes (use store directly, not deferred display nodes)
        const storeActNodes = actNodes as GraphNodeBase[];
        if (storeActNodes.length === 0) return;

        const currentIndex = storeActNodes.findIndex((node) => node.id === activeNodeId);
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const base = currentIndex < 0 ? (direction === 1 ? -1 : storeActNodes.length) : currentIndex;
        const nextIndex = (base + direction + storeActNodes.length) % storeActNodes.length;
        focusActNode(storeActNodes[nextIndex].id);
        event.preventDefault();
    }, [activeNodeId, actNodes, focusActNode, reactFlowInstance]);

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

    useEffect(() => {
        const COLLAPSE_THRESHOLD_MS = 300_000; // 5分
        const id = window.setInterval(() => {
            const currentActiveNodeId = activeNodeIdRef.current;
            if (currentActiveNodeId) {
                recordNodeUsed(currentActiveNodeId);
            }
            collapseUnusedNodes(Date.now(), COLLAPSE_THRESHOLD_MS);
        }, 5_000);
        return () => window.clearInterval(id);
    }, [collapseUnusedNodes, recordNodeUsed]);

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
        radialOverviewNodeById,
        recordRecentClickedNode,
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

    const recentClickedSelector = recentClickedNodeIds.length > 0 ? (
        <div className="pointer-events-none absolute left-1/2 top-6 z-20 flex w-[min(820px,calc(100%-2rem))] -translate-x-1/2 items-center justify-center gap-1.5">
            {recentClickedNodeIds.map((nodeId, index) => {
                const node = referenceableNodeById.get(nodeId);
                const data = node?.data as Record<string, unknown> | undefined;
                const label = typeof data?.label === 'string' && data.label.trim().length > 0
                    ? data.label.trim()
                    : nodeId;
                const isActive = activeNodeId === nodeId;

                return (
                    <React.Fragment key={nodeId}>
                        {index > 0 && <span className="text-[11px] font-semibold text-slate-400">&lt;&lt;</span>}
                        <button
                            type="button"
                            className={[
                                'pointer-events-auto max-w-[140px] rounded-xl border px-3 py-1.5 text-left text-xs font-medium transition-colors',
                                isActive
                                    ? 'border-slate-900/70 bg-slate-900/70 text-white'
                                    : 'border-slate-200/70 bg-white/60 text-slate-700 hover:border-slate-300/80 hover:bg-white/75',
                            ].join(' ')}
                            title={label}
                            onClick={() => handleSelectRecentNode(nodeId)}
                        >
                            <span className="block truncate">{truncate(label, 18)}</span>
                        </button>
                    </React.Fragment>
                );
            })}
        </div>
    ) : null;

    const setLayoutMode = useCallback((nextLayout: 'force' | 'radial' | 'orbit') => {
        const nextParams = new URLSearchParams(searchParams.toString());
        if (nextLayout === 'force') {
            nextParams.delete('layout');
        } else {
            nextParams.set('layout', nextLayout);
        }
        const nextQuery = nextParams.toString();
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }, [pathname, router, searchParams]);

    const layoutToggle = (
        <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-full border border-slate-200 bg-white/92 p-1 shadow-sm backdrop-blur-sm">
            {(['force', 'radial', 'orbit'] as const).map((mode) => {
                const active = persistedLayoutMode === mode;
                return (
                    <button
                        key={mode}
                        type="button"
                        className={[
                            'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200',
                            active
                                ? 'bg-slate-900 text-white'
                                : 'text-slate-600 hover:bg-slate-100',
                        ].join(' ')}
                        onClick={() => setLayoutMode(mode)}
                    >
                        {mode === 'force' ? 'Force' : mode === 'radial' ? 'Radial' : 'Orbit'}
                    </button>
                );
            })}
            <button
                type="button"
                className={[
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 border',
                    autoRouteEdgeHandles
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-100',
                ].join(' ')}
                onClick={() => setStreamPreferences({ autoRouteEdgeHandles: !autoRouteEdgeHandles })}
                title="Toggle nearest-side edge routing"
            >
                Auto Side
            </button>
        </div>
    );

    if (isRadialLayout) {
        return (
            <div className="relative h-full w-full">
                {layoutToggle}
                {recentClickedSelector}
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
        <div className="relative h-full w-full" onDoubleClick={handlePaneDoubleClick}>
            {layoutToggle}
            {recentClickedSelector}
            <SelectedNodePanel />
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
                nodes={emphasizedDisplayNodes as GraphNodeRender[]}
                edges={displayEdges}
                defaultEdgeOptions={{
                    style: { stroke: '#475569', strokeWidth: 2, strokeOpacity: 0.72 },
                }}
                onlyRenderVisibleElements={false}
                defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
                proOptions={{ hideAttribution: true }}
                onNodeClick={(event: React.MouseEvent, node: Node) => {
                    if (node.type === 'selectionHeader' || node.type === 'selectionNode') {
                        return;
                    }

                    // Keep recent-click history visible even when the click lands on inner controls.
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

                    // Click to explore: expand detail panel AND branch
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
                                    const { width, height } = getDisplayNodeDimensions(node as GraphNodeRender);
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
                    isShiftMarqueeSelectionRef.current = false;
                }}
                onPaneClick={() => {
                    setActiveNode(null);
                }}
                zoomOnDoubleClick={false}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesDraggable={false}
                panOnScroll
                panOnScrollSpeed={0.5}
                selectionOnDrag
                panOnDrag={[1, 2]}
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode="Meta"
                fitView
            >
                <Background color="var(--border)" gap={24} size={1} />
                <KeyboardShortcutsHint />
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
        </div>
    );
}
