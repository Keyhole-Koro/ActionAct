"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Background,
    Controls,
    MiniMap,
    Node,
    Edge,
    ReactFlow,
    SelectionMode,
    type EdgeProps,
    type NodeChange,
    useEdgesState,
    useNodesState,
    useReactFlow,
    BaseEdge,
    getBezierPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { organizeService } from '@/services/organize';
import { useGraphCommands } from '@/features/graph/hooks/useGraphCommands';
import { useGraphCache } from '@/features/graph/hooks/useGraphCache';
import { useGraphStore } from '@/features/graph/store';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { useAgentInteractionStore } from '@/features/agentInteraction/store/interactionStore';
import { actDraftService } from '@/services/actDraft/firestore';
import { GraphNodeCard } from './GraphNodeCard';
import { SelectionGroupHeader } from './SelectionGroupHeader';
import { SelectionNodeCard } from './SelectionNodeCard';
import { toSelectionFlow } from '../selectors/toSelectionFlow';
import { buildDisplayEdges, buildDisplayNodes, buildLayoutInput, buildVisibleTree, mergeTreeWithActNodes } from '../selectors/projectGraph';
import { orchestrateGraphLayout } from '../layout/orchestrate-layout';
import type { GraphNodeBase, GraphNodeRender, PersistedNodeData } from '../types';

type RecentClickedNode = {
    id: string;
    title: string;
};

type LayoutSandboxGraph = {
    treeNodes: GraphNodeBase[];
    treeEdges: Edge[];
    actNodes: GraphNodeBase[];
    actEdges: Edge[];
    expandedBranchNodeIds: string[];
    expandedNodeIds: string[];
};

const MAX_RECENT_CLICKED_NODES = 8;

function buildLayoutSandboxGraph(): LayoutSandboxGraph {
    const treeNodes: GraphNodeBase[] = [
        {
            id: 'sandbox-root',
            type: 'customTask',
            position: { x: 0, y: 0 },
            data: { nodeSource: 'persisted', label: 'Layout Sandbox', kind: 'topic' },
        },
        {
            id: 'sandbox-group-finance',
            type: 'customTask',
            position: { x: 0, y: 0 },
            data: { nodeSource: 'persisted', label: 'Finance Group', kind: 'cluster', parentId: 'sandbox-root' },
        },
        {
            id: 'sandbox-group-product',
            type: 'customTask',
            position: { x: 0, y: 0 },
            data: { nodeSource: 'persisted', label: 'Product Group', kind: 'subcluster', parentId: 'sandbox-root' },
        },
        {
            id: 'sandbox-microsoft',
            type: 'customTask',
            position: { x: 0, y: 0 },
            data: { nodeSource: 'persisted', label: 'Microsoft', kind: 'claim', parentId: 'sandbox-group-finance' },
        },
        {
            id: 'sandbox-amazon',
            type: 'customTask',
            position: { x: 0, y: 0 },
            data: { nodeSource: 'persisted', label: 'Amazon', kind: 'claim', parentId: 'sandbox-group-finance' },
        },
        {
            id: 'sandbox-windows',
            type: 'customTask',
            position: { x: 0, y: 0 },
            data: { nodeSource: 'persisted', label: 'Windows', kind: 'claim', parentId: 'sandbox-group-product' },
        },
        {
            id: 'sandbox-azure',
            type: 'customTask',
            position: { x: 0, y: 0 },
            data: { nodeSource: 'persisted', label: 'Azure', kind: 'claim', parentId: 'sandbox-group-product' },
        },
    ];

    const treeEdges: Edge[] = [
        { id: 'sandbox-edge-root-finance', source: 'sandbox-root', target: 'sandbox-group-finance', animated: true },
        { id: 'sandbox-edge-root-product', source: 'sandbox-root', target: 'sandbox-group-product', animated: true },
        { id: 'sandbox-edge-finance-microsoft', source: 'sandbox-group-finance', target: 'sandbox-microsoft', animated: true },
        { id: 'sandbox-edge-finance-amazon', source: 'sandbox-group-finance', target: 'sandbox-amazon', animated: true },
        { id: 'sandbox-edge-product-windows', source: 'sandbox-group-product', target: 'sandbox-windows', animated: true },
        { id: 'sandbox-edge-product-azure', source: 'sandbox-group-product', target: 'sandbox-azure', animated: true },
    ];

    const actNodes: GraphNodeBase[] = [
        {
            id: 'sandbox-act-compare',
            type: 'customTask',
            position: { x: 0, y: 0 },
            data: {
                nodeSource: 'act',
                createdBy: 'user',
                label: 'Compare earnings',
                kind: 'act',
                contentMd: '',
                referencedNodeIds: ['sandbox-microsoft', 'sandbox-amazon'],
            },
        },
        {
            id: 'sandbox-act-drilldown',
            type: 'customTask',
            position: { x: 0, y: 0 },
            data: {
                nodeSource: 'act',
                createdBy: 'agent',
                label: 'Windows revenue angle',
                kind: 'act',
                contentMd: 'Short answer ready.',
                referencedNodeIds: ['sandbox-windows'],
            },
        },
        {
            id: 'sandbox-act-freeform',
            type: 'customTask',
            position: { x: 0, y: 0 },
            data: {
                nodeSource: 'act',
                createdBy: 'user',
                label: 'Open question',
                kind: 'act',
                contentMd: '',
                referencedNodeIds: [],
            },
        },
    ];

    const actEdges: Edge[] = [
        { id: 'sandbox-edge-ctx-microsoft-compare', source: 'sandbox-microsoft', target: 'sandbox-act-compare', animated: true, style: { stroke: '#888', strokeDasharray: '5,5' } },
        { id: 'sandbox-edge-ctx-amazon-compare', source: 'sandbox-amazon', target: 'sandbox-act-compare', animated: true, style: { stroke: '#888', strokeDasharray: '5,5' } },
        { id: 'sandbox-edge-ctx-windows-drilldown', source: 'sandbox-windows', target: 'sandbox-act-drilldown', animated: true, style: { stroke: '#888', strokeDasharray: '5,5' } },
    ];

    return {
        treeNodes,
        treeEdges,
        actNodes,
        actEdges,
        expandedBranchNodeIds: ['sandbox-root', 'sandbox-group-finance', 'sandbox-group-product'],
        expandedNodeIds: ['sandbox-act-drilldown'],
    };
}

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

const nodeTypes = {
    customTask: GraphNodeCardWithBoundary,
    selectionHeader: SelectionGroupHeader,
    selectionNode: SelectionNodeCard,
};

function VisibleEdge(props: EdgeProps) {
    const points = (props.data as {
        sourceX?: number;
        sourceY?: number;
        targetX?: number;
        targetY?: number;
    } | undefined);

    const sourceX = typeof points?.sourceX === 'number' ? points.sourceX : props.sourceX;
    const sourceY = typeof points?.sourceY === 'number' ? points.sourceY : props.sourceY;
    const targetX = typeof points?.targetX === 'number' ? points.targetX : props.targetX;
    const targetY = typeof points?.targetY === 'number' ? points.targetY : props.targetY;

    const edgePath = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;

    const style = (props.style ?? {}) as React.CSSProperties;
    const stroke = typeof style.stroke === 'string' ? style.stroke : '#475569';
    const strokeWidth = typeof style.strokeWidth === 'number' ? style.strokeWidth : 2;
    const strokeOpacity = typeof style.strokeOpacity === 'number' ? style.strokeOpacity : 0.72;
    const strokeDasharray = typeof style.strokeDasharray === 'string' ? style.strokeDasharray : undefined;
    const diagnostic = Boolean((props.data as { diagnostic?: boolean } | undefined)?.diagnostic);

    return (
        <g className="react-flow__edge" data-edgeid={props.id}>
            {diagnostic && (
                <path
                    d={edgePath}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={Math.max(strokeWidth + 2, 4)}
                    strokeOpacity={0.35}
                    vectorEffect="non-scaling-stroke"
                    className="react-flow__edge-path"
                />
            )}
            <path
                d={edgePath}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeOpacity={strokeOpacity}
                strokeDasharray={strokeDasharray}
                vectorEffect="non-scaling-stroke"
                className="react-flow__edge-path"
            />
        </g>
    );
}

const edgeTypes = {
    visible: VisibleEdge,
};

function isRenderableCoordinate(value: number | undefined) {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 20000;
}

export function GraphCanvas() {
    const {
        persistedNodes,
        persistedEdges,
        actNodes,
        actEdges,
        layoutMode,
        setSelectedNodes,
        setLayoutMode,
        setActiveNode,
        toggleExpandedNode,
        addQueryActNode,
        addEmptyActNode,
        setPersistedGraph,
        setActGraph,
        editingNodeId,
        selectedNodeIds,
        expandedNodeIds,
        expandedBranchNodeIds,
        streamingNodeIds,
    } = useGraphStore();
    const { workspaceId, topicId } = useRunContextStore();
    const { groups } = useAgentInteractionStore();
    const commands = useGraphCommands({ workspaceId, topicId });
    const [, , reactFlowOnNodesChange] = useNodesState<Node>([]);
    const [, , onEdgesChange] = useEdgesState<Edge>([]);
    const reactFlowInstance = useReactFlow();
    const [layoutedNodes, setLayoutedNodes] = useState<Node[]>([]);
    const [layoutedEdges, setLayoutedEdges] = useState<Edge[]>([]);
    const [sandboxLayoutedNodes, setSandboxLayoutedNodes] = useState<Node[]>([]);
    const [sandboxLayoutedEdges, setSandboxLayoutedEdges] = useState<Edge[]>([]);
    const [manualNodeIds, setManualNodeIds] = useState<string[]>([]);
    const [recentClickedNodes, setRecentClickedNodes] = useState<RecentClickedNode[]>([]);
    const [showLayoutSandbox, setShowLayoutSandbox] = useState(false);
    const [showGraphDebug, setShowGraphDebug] = useState(false);
    const [showEdgeDiagnostic, setShowEdgeDiagnostic] = useState(false);
    const [debugCopyStatus, setDebugCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
    const previousLayoutRef = useRef<Node[]>([]);
    const previousSandboxLayoutRef = useRef<Node[]>([]);

    const getNodeDisplayTitle = useCallback((node: Node) => {
        const label = typeof node.data?.label === 'string' ? node.data.label.trim() : '';
        if (label) {
            return label;
        }
        return node.id;
    }, []);

    const sandboxGraph = useMemo(() => buildLayoutSandboxGraph(), []);

    useGraphCache({
        kind: 'persisted',
        workspaceId,
        nodes: persistedNodes,
        edges: persistedEdges,
        setGraph: setPersistedGraph,
    });

    // Stable refs so subscription doesn't depend on store identity
    const setPersistedGraphRef = useRef(setPersistedGraph);
    const persistedNodeCountRef = useRef(0);

    useEffect(() => {
        setPersistedGraphRef.current = setPersistedGraph;
    }, [setPersistedGraph]);

    useEffect(() => {
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

            // Guard: don't clear existing graph on transient empty snapshots
            if (nextPersistedNodes.length === 0 && persistedNodeCountRef.current > 0) {
                return;
            }
            persistedNodeCountRef.current = nextPersistedNodes.length;

            setPersistedGraphRef.current(nextPersistedNodes, nextPersistedEdges);
        });

        return () => unsubscribe();
    }, [topicId, workspaceId]);

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
        if (expandedBranchNodeIds.length > 0) {
            return expandedBranchNodeIds;
        }

        const allPersistedIds = new Set((persistedNodes as GraphNodeBase[]).map((node) => node.id));
        return (persistedNodes as GraphNodeBase[])
            .filter((node) => {
                const parentId = typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
                return !parentId || !allPersistedIds.has(parentId);
            })
            .map((node) => node.id);
    }, [expandedBranchNodeIds, persistedNodes]);

    const persistedTree = useMemo(
        () => buildVisibleTree(persistedNodes as GraphNodeBase[], persistedEdges, effectiveExpandedBranchNodeIds),
        [effectiveExpandedBranchNodeIds, persistedEdges, persistedNodes],
    );

    const { mergedTreeNodes, standaloneActNodes } = useMemo(
        () => mergeTreeWithActNodes(
            persistedTree.visibleNodes,
            persistedNodes as GraphNodeBase[],
            actNodes as GraphNodeBase[],
        ),
        [actNodes, persistedNodes, persistedTree.visibleNodes],
    );

    const { layoutInputNodes, layoutInputEdges } = useMemo(
        () => buildLayoutInput(mergedTreeNodes, persistedTree.visibleEdges, expandedNodeIds),
        [expandedNodeIds, mergedTreeNodes, persistedTree.visibleEdges],
    );

    const topologySignature = useMemo(
        () => JSON.stringify({
            nodes: [...layoutInputNodes, ...standaloneActNodes].map((node) => ({
                id: node.id,
                type: node.type,
                manual: Boolean(node.data?.isManualPosition),
            })),
            edges: [...layoutInputEdges, ...actEdges].map((edge) => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
            })),
        }),
        [actEdges, layoutInputEdges, layoutInputNodes, standaloneActNodes],
    );

    useEffect(() => {
        let mounted = true;
        void orchestrateGraphLayout(layoutMode, {
            layoutInputNodes: layoutInputNodes as Node[],
            standaloneActNodes: standaloneActNodes as Node[],
            layoutInputEdges: layoutInputEdges as Edge[],
            actEdges,
            previousNodes: previousLayoutRef.current,
            hoveredNodeId: null,
        }).then((result) => {
            if (!mounted) {
                return;
            }
            setLayoutedNodes(result.nodes);
            setLayoutedEdges(result.edges);
            previousLayoutRef.current = result.nodes;
        });
        return () => {
            mounted = false;
        };
    }, [actEdges, layoutInputEdges, layoutInputNodes, layoutMode, standaloneActNodes, topologySignature]);

    const sandboxPersistedTree = useMemo(
        () => buildVisibleTree(sandboxGraph.treeNodes, sandboxGraph.treeEdges, sandboxGraph.expandedBranchNodeIds),
        [sandboxGraph],
    );

    const { mergedTreeNodes: sandboxMergedTreeNodes, standaloneActNodes: sandboxStandaloneActNodes } = useMemo(
        () => mergeTreeWithActNodes(
            sandboxPersistedTree.visibleNodes,
            sandboxGraph.treeNodes,
            sandboxGraph.actNodes,
        ),
        [sandboxGraph.actNodes, sandboxGraph.treeNodes, sandboxPersistedTree.visibleNodes],
    );

    const { layoutInputNodes: sandboxLayoutInputNodes, layoutInputEdges: sandboxLayoutInputEdges } = useMemo(
        () => buildLayoutInput(
            sandboxMergedTreeNodes,
            sandboxPersistedTree.visibleEdges,
            sandboxGraph.expandedNodeIds,
        ),
        [sandboxGraph.expandedNodeIds, sandboxMergedTreeNodes, sandboxPersistedTree.visibleEdges],
    );

    const sandboxTopologySignature = useMemo(
        () => JSON.stringify({
            nodes: [...sandboxLayoutInputNodes, ...sandboxStandaloneActNodes].map((node) => node.id),
            edges: [...sandboxLayoutInputEdges, ...sandboxGraph.actEdges].map((edge) => edge.id),
        }),
        [sandboxGraph.actEdges, sandboxLayoutInputEdges, sandboxLayoutInputNodes, sandboxStandaloneActNodes],
    );

    useEffect(() => {
        if (!showLayoutSandbox) {
            setSandboxLayoutedNodes([]);
            setSandboxLayoutedEdges([]);
            previousSandboxLayoutRef.current = [];
            return;
        }

        let mounted = true;
        void orchestrateGraphLayout(layoutMode, {
            layoutInputNodes: sandboxLayoutInputNodes as Node[],
            standaloneActNodes: sandboxStandaloneActNodes as Node[],
            layoutInputEdges: sandboxLayoutInputEdges as Edge[],
            actEdges: sandboxGraph.actEdges,
            previousNodes: previousSandboxLayoutRef.current,
            hoveredNodeId: null,
        }).then((result) => {
            if (!mounted) {
                return;
            }
            setSandboxLayoutedNodes(result.nodes);
            setSandboxLayoutedEdges(result.edges);
            previousSandboxLayoutRef.current = result.nodes;
        });

        return () => {
            mounted = false;
        };
    }, [
        layoutMode,
        sandboxGraph.actEdges,
        sandboxLayoutInputEdges,
        sandboxLayoutInputNodes,
        sandboxStandaloneActNodes,
        sandboxTopologySignature,
        showLayoutSandbox,
    ]);

    const allReferenceableNodes = useMemo(
        () => [...persistedTree.visibleNodes, ...actNodes],
        [actNodes, persistedTree.visibleNodes],
    );

    const regularDisplayNodes = useMemo(
        () => buildDisplayNodes({
            layoutInputNodes: layoutInputNodes as GraphNodeBase[],
            standaloneActNodes: standaloneActNodes as GraphNodeBase[],
            layoutedNodes,
            manualNodeIds,
            selectedNodeIds,
            expandedBranchNodeIds,
            visiblePersistedNodeIds: persistedTree.visibleNodeIds,
            childrenByParent: persistedTree.childrenByParent,
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
            layoutInputNodes,
            layoutedNodes,
            manualNodeIds,
            persistedTree.childrenByParent,
            persistedTree.visibleNodeIds,
            selectedNodeIds,
            standaloneActNodes,
            streamingNodeIds,
        ],
    );

    const { nodes: selectionOverlayNodes, edges: selectionOverlayEdges } = useMemo(
        () => toSelectionFlow(groups, regularDisplayNodes),
        [groups, regularDisplayNodes],
    );

    const sandboxRegularDisplayNodes = useMemo(
        () => {
            if (!showLayoutSandbox) {
                return [];
            }
            return buildDisplayNodes({
                layoutInputNodes: sandboxLayoutInputNodes as GraphNodeBase[],
                standaloneActNodes: sandboxStandaloneActNodes as GraphNodeBase[],
                layoutedNodes: sandboxLayoutedNodes,
                manualNodeIds: [],
                selectedNodeIds: [],
                expandedBranchNodeIds: sandboxGraph.expandedBranchNodeIds,
                visiblePersistedNodeIds: sandboxPersistedTree.visibleNodeIds,
                childrenByParent: sandboxPersistedTree.childrenByParent,
                allReferenceableNodes: [...sandboxPersistedTree.visibleNodes, ...sandboxGraph.actNodes],
                isNodeExpanded: (nodeId) => sandboxGraph.expandedNodeIds.includes(nodeId),
                isNodeEditing: () => false,
                isNodeStreaming: () => false,
                onToggleBranch: () => {},
                onOpenDetails: () => {},
                onOpenReferencedNode: () => {},
                onCommitLabel: () => {},
                onRunAction: () => {},
                onAddMedia: async () => {},
            });
        },
        [
            sandboxGraph,
            sandboxLayoutInputNodes,
            sandboxLayoutedNodes,
            sandboxPersistedTree.childrenByParent,
            sandboxPersistedTree.visibleNodeIds,
            sandboxPersistedTree.visibleNodes,
            sandboxStandaloneActNodes,
            showLayoutSandbox,
        ],
    );

    const sandboxDisplayEdges = useMemo(
        () => {
            if (!showLayoutSandbox) {
                return [];
            }
            return buildDisplayEdges(
                sandboxLayoutedEdges,
                sandboxLayoutInputEdges,
                sandboxGraph.actEdges,
                [],
            );
        },
        [sandboxGraph.actEdges, sandboxLayoutInputEdges, sandboxLayoutedEdges, showLayoutSandbox],
    );

    const displayNodes = useMemo(
        () => [...regularDisplayNodes, ...selectionOverlayNodes],
        [regularDisplayNodes, selectionOverlayNodes],
    );
    const safeDisplayNodes = useMemo(
        () => displayNodes.map((node, index) => {
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
        }),
        [displayNodes],
    );
    const normalizedDisplayNodes = useMemo(() => {
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
    }, [safeDisplayNodes]);
    const sandboxOffsetDisplayNodes = useMemo(() => {
        if (!showLayoutSandbox || sandboxRegularDisplayNodes.length === 0) {
            return [];
        }

        const currentMaxX = normalizedDisplayNodes.reduce((max, node) => Math.max(max, node.position.x), 120);
        const currentMinY = normalizedDisplayNodes.reduce((min, node) => Math.min(min, node.position.y), 100);
        const sandboxMinX = sandboxRegularDisplayNodes.reduce((min, node) => Math.min(min, node.position.x), 0);
        const sandboxMinY = sandboxRegularDisplayNodes.reduce((min, node) => Math.min(min, node.position.y), 0);
        const offsetX = currentMaxX + 720 - sandboxMinX;
        const offsetY = currentMinY + 60 - sandboxMinY;

        return sandboxRegularDisplayNodes.map((node) => ({
            ...node,
            id: `sandbox-view-${node.id}`,
            position: {
                x: node.position.x + offsetX,
                y: node.position.y + offsetY,
            },
            data: {
                ...node.data,
                label: `${node.data.label}${node.data.nodeSource === 'persisted' && node.id === 'sandbox-root' ? ` (${layoutMode})` : ''}`,
            },
            selectable: false,
            draggable: false,
        }));
    }, [layoutMode, normalizedDisplayNodes, sandboxRegularDisplayNodes, showLayoutSandbox]);
    const displayEdges = useMemo(
        () => {
            const baseEdges = buildDisplayEdges(layoutedEdges, layoutInputEdges, actEdges, selectionOverlayEdges);
            const edgesWithSandbox = (!showLayoutSandbox || sandboxOffsetDisplayNodes.length === 0 || sandboxDisplayEdges.length === 0)
                ? baseEdges
                : (() => {
                    const sandboxViewNodeIdBySourceId = new Map(
                        sandboxOffsetDisplayNodes.map((node) => [node.id.replace(/^sandbox-view-/, ''), node.id]),
                    );

                    return [
                        ...baseEdges,
                        ...sandboxDisplayEdges.map((edge) => ({
                            ...edge,
                            id: `sandbox-view-${edge.id}`,
                            source: sandboxViewNodeIdBySourceId.get(edge.source) ?? edge.source,
                            target: sandboxViewNodeIdBySourceId.get(edge.target) ?? edge.target,
                            animated: edge.animated ?? false,
                            style: ('style' in edge && edge.style) ? edge.style : { stroke: 'var(--primary)', strokeWidth: 1.5, strokeOpacity: 0.5 },
                        })),
                    ];
                })();

            const nodeById = new Map([
                ...normalizedDisplayNodes,
                ...sandboxOffsetDisplayNodes,
            ].map((node) => [node.id, node]));

            // Force a visible default so edges do not disappear when theme/CSS vars are unresolved.
            return edgesWithSandbox.map((edge) => ({
                ...edge,
                type: 'visible',
                data: {
                    ...((edge as Edge).data ?? {}),
                    diagnostic: showEdgeDiagnostic,
                    sourceX: (nodeById.get(edge.source)?.position.x ?? 0) + 170,
                    sourceY: (nodeById.get(edge.source)?.position.y ?? 0) + 90,
                    targetX: (nodeById.get(edge.target)?.position.x ?? 0) + 170,
                    targetY: (nodeById.get(edge.target)?.position.y ?? 0) + 90,
                },
                zIndex: (edge as Edge).zIndex ?? 60,
                style: {
                    stroke: '#475569',
                    strokeWidth: 2,
                    strokeOpacity: 0.72,
                    ...((edge as Edge).style ?? {}),
                },
            }));
        },
        [
            actEdges,
            layoutInputEdges,
            layoutedEdges,
            normalizedDisplayNodes,
            sandboxDisplayEdges,
            sandboxOffsetDisplayNodes,
            selectionOverlayEdges,
            showEdgeDiagnostic,
            showLayoutSandbox,
        ],
    );
    useEffect(() => {
        if (!showLayoutSandbox) {
            return;
        }
        console.info('[GraphCanvas sandbox]', {
            nodeIds: sandboxOffsetDisplayNodes.map((node) => node.id),
            edgeIds: displayEdges
                .filter((edge) => edge.id.startsWith('sandbox-view-'))
                .map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
        });
    }, [displayEdges, sandboxOffsetDisplayNodes, showLayoutSandbox]);
    const visibleRecentClickedNodes = useMemo(() => {
        const existingNodeIds = new Set(normalizedDisplayNodes.map((node) => node.id));
        return recentClickedNodes.filter((item) => existingNodeIds.has(item.id));
    }, [normalizedDisplayNodes, recentClickedNodes]);

    const graphDebugMetrics = useMemo(() => {
        const renderedNodeIds = new Set([
            ...normalizedDisplayNodes.map((node) => node.id),
            ...sandboxOffsetDisplayNodes.map((node) => node.id),
        ]);

        const danglingEdgeCount = displayEdges.filter((edge) => (
            !renderedNodeIds.has(edge.source) || !renderedNodeIds.has(edge.target)
        )).length;

        return {
            persistedNodes: persistedNodes.length,
            persistedEdges: persistedEdges.length,
            visibleTreeNodes: persistedTree.visibleNodes.length,
            visibleTreeEdges: persistedTree.visibleEdges.length,
            actNodes: actNodes.length,
            actEdges: actEdges.length,
            layoutInputNodes: layoutInputNodes.length,
            layoutInputEdges: layoutInputEdges.length,
            layoutedEdges: layoutedEdges.length,
            displayEdges: displayEdges.length,
            danglingEdges: danglingEdgeCount,
            sandboxEnabled: showLayoutSandbox,
            sandboxEdges: sandboxDisplayEdges.length,
        };
    }, [
        actEdges,
        actNodes.length,
        displayEdges,
        layoutInputEdges.length,
        layoutInputNodes.length,
        layoutedEdges.length,
        normalizedDisplayNodes,
        persistedEdges.length,
        persistedNodes.length,
        persistedTree.visibleEdges.length,
        persistedTree.visibleNodes.length,
        sandboxDisplayEdges.length,
        sandboxOffsetDisplayNodes,
        showLayoutSandbox,
    ]);

    const graphDebugDetails = useMemo(() => {
        const allRenderedNodes = [...normalizedDisplayNodes, ...sandboxOffsetDisplayNodes];
        const nodeById = new Map(allRenderedNodes.map((node) => [node.id, node]));

        const edgeTypeCounts = displayEdges.reduce((acc, edge) => {
            const key = edge.id.startsWith('sandbox-view-')
                ? 'sandbox'
                : edge.id.startsWith('edge-ctx-')
                    ? 'act-context'
                    : edge.id.startsWith('e-')
                        ? 'tree-parent'
                        : edge.id.startsWith('e-group-') || edge.id.startsWith('e-anchor-')
                            ? 'selection'
                            : 'other';
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const sampledEdges = displayEdges.slice(0, 14).map((edge) => {
            const sourceNode = nodeById.get(edge.source);
            const targetNode = nodeById.get(edge.target);

            return {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                animated: edge.animated ?? false,
                sourcePosition: sourceNode ? sourceNode.position : null,
                targetPosition: targetNode ? targetNode.position : null,
                style: (edge as Edge).style ?? null,
            };
        });

        return {
            edgeTypeCounts,
            sampledEdges,
        };
    }, [displayEdges, normalizedDisplayNodes, sandboxOffsetDisplayNodes]);

    const copyGraphDebugMetrics = useCallback(async () => {
        const payload = {
            timestamp: new Date().toISOString(),
            workspaceId,
            topicId,
            metrics: graphDebugMetrics,
            details: graphDebugDetails,
        };

        try {
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            setDebugCopyStatus('copied');
        } catch {
            setDebugCopyStatus('failed');
        }

        window.setTimeout(() => setDebugCopyStatus('idle'), 1800);
    }, [graphDebugDetails, graphDebugMetrics, topicId, workspaceId]);

    const focusNode = useCallback((nodeId: string) => {
        const targetNode = normalizedDisplayNodes.find((node) => node.id === nodeId);
        if (!targetNode) {
            return;
        }

        setActiveNode(targetNode.id);
        const nextZoom = reactFlowInstance.getZoom() > 1.1
            ? 0.92
            : reactFlowInstance.getZoom();
        reactFlowInstance.setCenter(
            targetNode.position.x + 170,
            targetNode.position.y + 90,
            { duration: 240, zoom: nextZoom },
        );
    }, [normalizedDisplayNodes, reactFlowInstance, setActiveNode]);

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

    const fitViewSignature = useMemo(
        () => JSON.stringify({
            layoutMode,
            topologySignature,
            sandbox: showLayoutSandbox ? sandboxTopologySignature : 'off',
        }),
        [layoutMode, sandboxTopologySignature, showLayoutSandbox, topologySignature],
    );
    const previousFitViewSignatureRef = useRef<string | null>(null);

    useEffect(() => {
        if (normalizedDisplayNodes.length === 0) {
            previousFitViewSignatureRef.current = null;
            return;
        }

        if (fitViewSignature === previousFitViewSignatureRef.current) {
            return;
        }
        previousFitViewSignatureRef.current = fitViewSignature;

        const timeoutId = window.setTimeout(() => {
            reactFlowInstance.fitView({
                duration: 180,
                padding: 0.14,
                minZoom: 0.2,
                maxZoom: 1.2,
            });
        }, 50);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [fitViewSignature, normalizedDisplayNodes.length, reactFlowInstance]);

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

        const selectedNodes = regularDisplayNodes.filter((node) => selectedNodeIds.includes(node.id));
        if (selectedNodes.length === 0) {
            return;
        }

        const averageX = selectedNodes.reduce((sum, node) => sum + node.position.x, 0) / selectedNodes.length;
        const maxY = selectedNodes.reduce((max, node) => Math.max(max, node.position.y), selectedNodes[0].position.y);
        addQueryActNode({ x: averageX, y: maxY + 240 }, event.key);
        event.preventDefault();
    }, [addQueryActNode, editingNodeId, regularDisplayNodes, selectedNodeIds]);

    useEffect(() => {
        const handleFocusNode = (e: Event) => {
            const customEvent = e as CustomEvent<{ nodeId: string }>;
            if (customEvent.detail?.nodeId) {
                toggleExpandedNode(customEvent.detail.nodeId);
                focusNode(customEvent.detail.nodeId);
            }
        };
        window.addEventListener('action:focus-node', handleFocusNode);
        return () => window.removeEventListener('action:focus-node', handleFocusNode);
    }, [focusNode, toggleExpandedNode]);

    const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
        reactFlowOnNodesChange(changes);

        const completedMoves = changes
            .filter((change): change is Extract<NodeChange<Node>, { type: 'position' }> => (
                change.type === 'position' && change.dragging === false
            ))
            .map((change) => change.id);

        if (completedMoves.length === 0) {
            return;
        }

        setManualNodeIds((currentIds) => {
            const nextIds = new Set(currentIds);
            completedMoves.forEach((id) => nextIds.add(id));
            return [...nextIds];
        });
    }, [reactFlowOnNodesChange]);

    useEffect(() => {
        window.addEventListener('keydown', handleSelectionTyping);
        return () => window.removeEventListener('keydown', handleSelectionTyping);
    }, [handleSelectionTyping]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const persisted = window.localStorage.getItem('graph.debug.visible');
        if (persisted === '1') {
            setShowGraphDebug(true);
        }
        const persistedEdgeDiag = window.localStorage.getItem('graph.edgeDiag.visible');
        if (persistedEdgeDiag === '1') {
            setShowEdgeDiagnostic(true);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem('graph.debug.visible', showGraphDebug ? '1' : '0');
    }, [showGraphDebug]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem('graph.edgeDiag.visible', showEdgeDiagnostic ? '1' : '0');
    }, [showEdgeDiagnostic]);

    return (
        <div className="relative w-full h-full" onDoubleClick={handlePaneDoubleClick}>
            <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-xl border border-border/60 bg-background/95 p-1 shadow-sm backdrop-blur-sm">
                {([
                    { value: 'tree-act-cluster', label: 'Tree' },
                    { value: 'radial', label: 'Radial' },
                ] as const).map((option) => {
                    const active = layoutMode === option.value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                setLayoutMode(option.value);
                            }}
                            className={[
                                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                                active
                                    ? 'bg-foreground text-background shadow-sm'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            ].join(' ')}
                        >
                            {option.label}
                        </button>
                    );
                })}
                <div className="mx-1 h-5 w-px bg-border/70" />
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        setShowLayoutSandbox((current) => !current);
                    }}
                    className={[
                        'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                        showLayoutSandbox
                            ? 'bg-primary/12 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    ].join(' ')}
                >
                    Demo
                </button>
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        setShowGraphDebug((current) => !current);
                    }}
                    className={[
                        'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                        showGraphDebug
                            ? 'bg-foreground text-background shadow-sm'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    ].join(' ')}
                >
                    Debug
                </button>
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        setShowEdgeDiagnostic((current) => !current);
                    }}
                    className={[
                        'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                        showEdgeDiagnostic
                            ? 'bg-red-500/15 text-red-700'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    ].join(' ')}
                >
                    EdgeDiag
                </button>
            </div>
            {showGraphDebug && (
                <div className="absolute right-4 top-16 z-20 rounded-lg border border-border/70 bg-background/92 px-2.5 py-2 text-[10px] leading-4 text-foreground/90 shadow-sm backdrop-blur-sm pointer-events-auto">
                    <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="font-semibold text-[10px] text-foreground/95">Graph Debug</div>
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                void copyGraphDebugMetrics();
                            }}
                            className="rounded border border-border/80 bg-background px-1.5 py-0.5 text-[10px] font-semibold text-foreground/85 hover:bg-muted"
                        >
                            {debugCopyStatus === 'copied' ? 'Copied' : debugCopyStatus === 'failed' ? 'Failed' : 'Copy'}
                        </button>
                    </div>
                    <div>persisted: {graphDebugMetrics.persistedNodes}n / {graphDebugMetrics.persistedEdges}e</div>
                    <div>visible tree: {graphDebugMetrics.visibleTreeNodes}n / {graphDebugMetrics.visibleTreeEdges}e</div>
                    <div>act: {graphDebugMetrics.actNodes}n / {graphDebugMetrics.actEdges}e</div>
                    <div>layout input: {graphDebugMetrics.layoutInputNodes}n / {graphDebugMetrics.layoutInputEdges}e</div>
                    <div>layouted edges: {graphDebugMetrics.layoutedEdges}</div>
                    <div className="font-semibold">display edges: {graphDebugMetrics.displayEdges}</div>
                    <div>dangling edges: {graphDebugMetrics.danglingEdges}</div>
                    <div>sandbox: {graphDebugMetrics.sandboxEnabled ? 'on' : 'off'} ({graphDebugMetrics.sandboxEdges}e)</div>
                    <div>edge diag: {showEdgeDiagnostic ? 'on' : 'off'}</div>
                </div>
            )}
            {visibleRecentClickedNodes.length > 0 && (
                <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 max-w-[min(62vw,760px)] overflow-x-auto px-1 py-1">
                    <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground whitespace-nowrap uppercase">Recent</span>
                    {visibleRecentClickedNodes.map((item, index) => (
                        <React.Fragment key={item.id}>
                            {index > 0 && (
                                <span className="shrink-0 text-xs font-black tracking-tight text-primary/55 select-none" aria-hidden>
                                    &lt;&lt;
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={() => focusNode(item.id)}
                                className="pointer-events-auto max-w-44 shrink-0 truncate rounded-lg border border-primary/35 bg-gradient-to-b from-background to-muted/35 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/70 hover:shadow-md"
                                title={item.title}
                                aria-label={`Focus ${item.title}`}
                            >
                                {item.title || "Untitled"}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            )}
            <ReactFlow
                nodes={[...normalizedDisplayNodes, ...sandboxOffsetDisplayNodes] as GraphNodeRender[]}
                edges={displayEdges}
                edgeTypes={edgeTypes}
                defaultEdgeOptions={{
                    type: 'visible',
                    style: { stroke: '#475569', strokeWidth: 2, strokeOpacity: 0.72 },
                }}
                onlyRenderVisibleElements={false}
                defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
                proOptions={{ hideAttribution: true }}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={(event: React.MouseEvent, node: Node) => {
                    const target = event.target;
                    if (
                        target instanceof HTMLElement
                        && target.closest('button, input, textarea, label, [role="button"], [data-stop-node-click="true"]')
                    ) {
                        return;
                    }

                    if (event.shiftKey) {
                        setSelectedNodes(
                            selectedNodeIds.includes(node.id)
                                ? selectedNodeIds.filter((selectedId) => selectedId !== node.id).sort()
                                : [...selectedNodeIds, node.id].sort(),
                        );
                        setActiveNode(node.id);
                        return;
                    }

                    setRecentClickedNodes((current) => [
                        { id: node.id, title: getNodeDisplayTitle(node) },
                        ...current.filter((item) => item.id !== node.id),
                    ].slice(0, MAX_RECENT_CLICKED_NODES));

                    toggleExpandedNode(node.id);
                    focusNode(node.id);
                }}
                onNodeDoubleClick={(_event: React.MouseEvent, node: Node) => {
                    reactFlowInstance.setCenter(
                        node.position.x + 170,
                        node.position.y + 90,
                        { duration: 300, zoom: Math.max(reactFlowInstance.getZoom(), 0.9) },
                    );
                }}
                onPaneClick={() => {
                    setSelectedNodes([]);
                    setActiveNode(null);
                }}
                zoomOnDoubleClick={false}
                nodeTypes={nodeTypes}
                nodesDraggable
                panOnScroll
                selectionOnDrag
                panOnDrag={[1, 2]}
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode="Shift"
                fitView
            >
                <Background color="var(--border)" gap={24} size={1} />
                <Controls className="!bg-white !border-border/40 !rounded-md !shadow-sm" />
                <MiniMap
                    className="!bg-white !border-border/40 !rounded-md !shadow-sm"
                    maskColor="rgba(0,0,0,0.05)"
                    nodeColor={() => 'var(--primary)'}
                />
            </ReactFlow>
        </div>
    );
}
