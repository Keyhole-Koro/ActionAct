"use client";

import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import {
    ReactFlow,
    Controls,
    Background,
    MiniMap,
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    useReactFlow,
    SelectionMode,
    type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { GraphNodeCard } from './GraphNodeCard';
import { organizeService } from '@/services/organize';
import { TopicNode } from '@/services/organize/port';
import { useGraphStore } from '@/features/graph/store';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { usePanelStore } from '@/features/layout/store/panel-store';

import { SelectionGroupHeader } from './SelectionGroupHeader';
import { SelectionNodeCard } from './SelectionNodeCard';
import { useAgentInteractionStore } from '@/features/agentInteraction/store/interactionStore';
import { toSelectionFlow } from '../selectors/toSelectionFlow';
import { getLayoutedElements } from '../utils/layout';

const nodeTypes = {
    customTask: GraphNodeCard,
    selectionHeader: SelectionGroupHeader,
    selectionNode: SelectionNodeCard,
};

function persistedGraphCacheKey(workspaceId: string) {
    return `graph.persisted.${workspaceId}`;
}

function actGraphCacheKey(workspaceId: string) {
    return `graph.act.${workspaceId}`;
}

function serializePersistedGraph(nodes: Node[], edges: Edge[]) {
    return JSON.stringify({ nodes, edges });
}

function deserializePersistedGraph(rawValue: string | null): { nodes: Node[]; edges: Edge[] } | null {
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

export function GraphCanvas() {
    const {
        persistedNodes,
        persistedEdges,
        nodes: actNodes,
        edges: actEdges,
        setSelectedNodes,
        setActiveNode,
        addEmptyNode,
        addQueryNode,
        setPersistedGraph,
        setDraftGraph,
        setActGraph,
        editingNodeId,
        selectedNodeIds,
        expandedBranchNodeIds,
    } = useGraphStore();
    const { workspaceId, topicId } = useRunContextStore();
    const { openPanel } = usePanelStore();
    const [, , reactFlowOnNodesChange] = useNodesState<Node>([]);
    const [, , onEdgesChange] = useEdgesState<Edge>([]);
    const reactFlowInstance = useReactFlow();
    const hydratedPersistedCacheKeyRef = useRef<string | null>(null);
    const hydratedActCacheKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const cacheKey = persistedGraphCacheKey(workspaceId);
        
        if (hydratedPersistedCacheKeyRef.current === cacheKey) {
            return;
        }

        hydratedPersistedCacheKeyRef.current = cacheKey;
        const cachedGraph = deserializePersistedGraph(window.localStorage.getItem(cacheKey));
        if (cachedGraph && cachedGraph.nodes.length > 0) {
            setPersistedGraph(cachedGraph.nodes, cachedGraph.edges);
        }
    }, [setPersistedGraph, workspaceId]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const cacheKey = actGraphCacheKey(workspaceId);
        if (hydratedActCacheKeyRef.current === cacheKey) {
            return;
        }

        hydratedActCacheKeyRef.current = cacheKey;
        const cachedGraph = deserializePersistedGraph(window.localStorage.getItem(cacheKey));
        if (cachedGraph) {
            setActGraph(cachedGraph.nodes, cachedGraph.edges);
            return;
        }

        setActGraph([], []);
    }, [setActGraph, workspaceId]);

    useEffect(() => {
        const unsubscribe = organizeService.subscribeTree(workspaceId, topicId, (topicNodes: TopicNode[]) => {
            const rfNodes: Node[] = topicNodes.map((n, i) => ({
                id: n.id,
                type: 'customTask',
                position: { x: 120, y: i * 180 + 80 },
                data: {
                    topicId: n.topicId,
                    label: n.title,
                    kind: n.kind,
                    contextSummary: n.contextSummary,
                    detailHtml: n.detailHtml,
                    contentMd: n.contentMd,
                    evidenceRefs: n.evidenceRefs,
                },
            }));

            const rfEdges: Edge[] = topicNodes
                .filter(n => n.parentId)
                .map(n => ({
                    id: `e-${n.parentId}-${n.id}`,
                    source: n.parentId!,
                    target: n.id,
                    animated: true,
                }));

            if (rfNodes.length === 0 && persistedNodes.length > 0) {
                return;
            }

            setPersistedGraph(rfNodes, rfEdges);

            if (typeof window !== 'undefined' && rfNodes.length > 0) {
                window.localStorage.setItem(
                    persistedGraphCacheKey(workspaceId),
                    serializePersistedGraph(rfNodes, rfEdges),
                );
            }
        });

        return () => unsubscribe();
    }, [persistedNodes.length, setPersistedGraph, workspaceId, topicId]);

    useEffect(() => {
        setDraftGraph([], []);
    }, [setDraftGraph, topicId, workspaceId]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (actNodes.length === 0 && actEdges.length === 0) {
            return;
        }

        window.localStorage.setItem(
            actGraphCacheKey(workspaceId),
            serializePersistedGraph(actNodes, actEdges),
        );
    }, [actEdges, actNodes, workspaceId]);

    const persistedTreeChildrenByParent = useMemo(() => {
        const byParent = new Map<string, string[]>();
        persistedEdges.forEach((edge) => {
            const children = byParent.get(edge.source) ?? [];
            children.push(edge.target);
            byParent.set(edge.source, children);
        });
        return byParent;
    }, [persistedEdges]);
    const visiblePersistedNodeIds = useMemo(() => {
        const allPersistedIds = new Set(persistedNodes.map((node) => node.id));
        const childIds = new Set(persistedEdges.map((edge) => edge.target));
        const rootIds = persistedNodes
            .map((node) => node.id)
            .filter((nodeId) => !childIds.has(nodeId));
        const visible = new Set(rootIds);
        const queue = [...rootIds];

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (!expandedBranchNodeIds.includes(currentId)) {
                continue;
            }
            const children = persistedTreeChildrenByParent.get(currentId) ?? [];
            children.forEach((childId) => {
                if (!allPersistedIds.has(childId) || visible.has(childId)) {
                    return;
                }
                visible.add(childId);
                queue.push(childId);
            });
        }

        if (visible.size === 0) {
            persistedNodes.forEach((node) => visible.add(node.id));
        }

        return visible;
    }, [expandedBranchNodeIds, persistedEdges, persistedNodes, persistedTreeChildrenByParent]);
    const visiblePersistedNodes = useMemo(
        () => persistedNodes.filter((node) => visiblePersistedNodeIds.has(node.id)),
        [persistedNodes, visiblePersistedNodeIds],
    );
    const visiblePersistedEdges = useMemo(
        () => persistedEdges.filter((edge) => visiblePersistedNodeIds.has(edge.source) && visiblePersistedNodeIds.has(edge.target)),
        [persistedEdges, visiblePersistedNodeIds],
    );

    const { groups } = useAgentInteractionStore();
    const selectionBaseNodes = useMemo(() => [...visiblePersistedNodes], [visiblePersistedNodes]);
    const { nodes: selectionNodes, edges: selectionEdges } = useMemo(
        () => toSelectionFlow(groups, selectionBaseNodes),
        [groups, selectionBaseNodes],
    );
    const lastDebugSignature = useRef<string>('');

    // Combine node sources.
    // If an act node reuses an existing node id, overlay draft fields on persisted nodes.
    // Standalone act nodes are placed in a separate lane so they do not split persisted parent/child chains.
    const { mergedTreeNodes, standaloneActNodes } = useMemo(() => {
        const actNodesById = new Map(actNodes.map((node) => [node.id, node]));
        const mergedPersistedNodes = visiblePersistedNodes.map((node) => {
            const draftNode = actNodesById.get(node.id);
            if (!draftNode) {
                return node;
            }
            return {
                ...node,
                position: draftNode.position ?? node.position,
                data: {
                    ...node.data,
                    ...draftNode.data,
                },
            };
        });
        const standaloneActNodes = actNodes.filter((actNode) => !persistedNodes.some((node) => node.id === actNode.id));
        return { mergedTreeNodes: mergedPersistedNodes, standaloneActNodes };
    }, [actNodes, persistedNodes, visiblePersistedNodes]);
    const layoutInputNodes = useMemo(
        () => [...mergedTreeNodes, ...selectionNodes],
        [mergedTreeNodes, selectionNodes],
    );
    const layoutInputEdges = useMemo(
        () => [...visiblePersistedEdges, ...selectionEdges],
        [selectionEdges, visiblePersistedEdges],
    );

    // State for auto-layouted nodes/edges
    const [layoutedNodes, setLayoutedNodes] = useState<Node[]>([]);
    const [layoutedEdges, setLayoutedEdges] = useState<Edge[]>([]);
    const [manualNodeIds, setManualNodeIds] = useState<string[]>([]);
    const previousLayoutRef = useRef<Node[]>([]);
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
        const nodes = [
            ...visiblePersistedNodes.map((node) => ({
                id: node.id,
                source: 'persisted',
                label: typeof node.data?.label === 'string' ? node.data.label : '',
                kind: typeof node.data?.kind === 'string' ? node.data.kind : '',
                contentLength: typeof node.data?.contentMd === 'string' ? node.data.contentMd.length : 0,
            })),
            ...actNodes.map((node) => ({
                id: node.id,
                source: 'act',
                label: typeof node.data?.label === 'string' ? node.data.label : '',
                kind: typeof node.data?.kind === 'string' ? node.data.kind : '',
                contentLength: typeof node.data?.contentMd === 'string' ? node.data.contentMd.length : 0,
            })),
            ...selectionNodes.map((node) => ({
                id: node.id,
                source: 'selection',
                label: typeof node.data?.label === 'string' ? node.data.label : '',
                kind: typeof node.data?.kind === 'string' ? node.data.kind : '',
                contentLength: typeof node.data?.contentMd === 'string' ? node.data.contentMd.length : 0,
            })),
        ];

        const signature = JSON.stringify({
            workspaceId,
            topicId,
            nodes,
        });

        if (signature === lastDebugSignature.current) {
            return;
        }
        lastDebugSignature.current = signature;

        console.info('[GraphCanvas] node sources', {
            workspaceId,
            topicId,
            persistedCount: persistedNodes.length,
            draftCount: 0,
            actCount: actNodes.length,
            selectionCount: selectionNodes.length,
            nodes,
        });
    }, [actNodes, selectionNodes, topicId, visiblePersistedNodes, workspaceId]);

    const displayNodes = useMemo(() => {
        const layoutById = new Map(layoutedNodes.map((node) => [node.id, node]));
        const maxTreeX = layoutedNodes.reduce((max, node) => Math.max(max, node.position.x), 0);
        const standaloneActNodesById = new Map(standaloneActNodes.map((node) => [node.id, node]));
        const actLaneNodes = standaloneActNodes.map((node, index) => {
            const layoutedNode = layoutById.get(node.id);
            const sourceNode = layoutedNode ?? node;
            return {
                ...sourceNode,
                position: {
                    x: maxTreeX + 420,
                    y: sourceNode.position.y + (index * 220),
                },
            };
        });
        const combinedNodes = [...layoutInputNodes, ...actLaneNodes];

        return combinedNodes.map((node) => {
            const layoutedNode = layoutById.get(node.id);
            const mergedNode = standaloneActNodesById.has(node.id)
                ? node
                : !layoutedNode
                ? node
                : {
                    ...node,
                    position: layoutedNode.position,
                    sourcePosition: layoutedNode.sourcePosition,
                    targetPosition: layoutedNode.targetPosition,
                };
            const hasChildNodes = persistedTreeChildrenByParent.has(node.id);
            const hiddenChildCount = (persistedTreeChildrenByParent.get(node.id) ?? []).filter((childId) => !visiblePersistedNodeIds.has(childId)).length;

            if (!manualNodeIds.includes(node.id)) {
                return {
                    ...mergedNode,
                    selected: selectedNodeIds.includes(node.id),
                    data: {
                        ...mergedNode.data,
                        hasChildNodes,
                        branchExpanded: expandedBranchNodeIds.includes(node.id),
                        hiddenChildCount,
                    },
                };
            }

            return {
                ...mergedNode,
                selected: selectedNodeIds.includes(node.id),
                data: {
                    ...mergedNode.data,
                    isManualPosition: true,
                    hasChildNodes,
                    branchExpanded: expandedBranchNodeIds.includes(node.id),
                    hiddenChildCount,
                },
            };
        });
    }, [expandedBranchNodeIds, layoutInputNodes, layoutedNodes, manualNodeIds, persistedTreeChildrenByParent, selectedNodeIds, standaloneActNodes, visiblePersistedNodeIds]);

    const displayEdges = useMemo(
        () => [...(layoutedEdges.length > 0 ? layoutedEdges : layoutInputEdges), ...actEdges],
        [actEdges, layoutInputEdges, layoutedEdges],
    );

    // Apply auto-layout asynchronously only when topology changes
    useEffect(() => {
        let mounted = true;
        getLayoutedElements(layoutInputNodes, layoutInputEdges, 'TB', { nodes: previousLayoutRef.current }).then((res) => {
            if (mounted) {
                setLayoutedNodes(res.nodes);
                setLayoutedEdges(res.edges);
                previousLayoutRef.current = res.nodes;
            }
        });
        return () => { mounted = false; };
    }, [layoutInputEdges, layoutInputNodes, topologySignature]);

    // Canvas double-click → create empty node
    const handlePaneDoubleClick = useCallback((event: React.MouseEvent) => {
        const position = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });
        addEmptyNode(position);
    }, [reactFlowInstance, addEmptyNode]);

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

        const selectedNodes = displayNodes.filter((node) => selectedNodeIds.includes(node.id));
        if (selectedNodes.length === 0) {
            return;
        }

        const averageX = selectedNodes.reduce((sum, node) => sum + node.position.x, 0) / selectedNodes.length;
        const maxY = selectedNodes.reduce((max, node) => Math.max(max, node.position.y), selectedNodes[0].position.y);
        addQueryNode({ x: averageX, y: maxY + 240 }, event.key);
        event.preventDefault();
    }, [addQueryNode, displayNodes, editingNodeId, selectedNodeIds]);

    // Track last click time for manual double-click detection
    const lastClickTime = useRef<number>(0);
    const nodeClickTimeoutRef = useRef<number | null>(null);
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
        return () => {
            if (nodeClickTimeoutRef.current !== null) {
                window.clearTimeout(nodeClickTimeoutRef.current);
            }
        };
    }, []);

    return (
        <div className="w-full h-full pb-20">
            <ReactFlow
                nodes={displayNodes}
                edges={displayEdges}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={(event: React.MouseEvent, node: Node) => {
                    if (event.shiftKey) {
                        setSelectedNodes(
                            selectedNodeIds.includes(node.id)
                                ? selectedNodeIds.filter((selectedId) => selectedId !== node.id).sort()
                                : [...selectedNodeIds, node.id].sort(),
                        );
                        setActiveNode(node.id);
                        return;
                    }
                    if (nodeClickTimeoutRef.current !== null) {
                        window.clearTimeout(nodeClickTimeoutRef.current);
                    }

                    nodeClickTimeoutRef.current = window.setTimeout(() => {
                        setActiveNode(node.id);
                        openPanel('node-detail', node.id);
                        nodeClickTimeoutRef.current = null;
                    }, 220);
                }}
                onNodeDoubleClick={(_event: React.MouseEvent, node: Node) => {
                    if (nodeClickTimeoutRef.current !== null) {
                        window.clearTimeout(nodeClickTimeoutRef.current);
                        nodeClickTimeoutRef.current = null;
                    }
                    reactFlowInstance.setCenter(
                        node.position.x + 170,
                        node.position.y + 90,
                        { duration: 300, zoom: Math.max(reactFlowInstance.getZoom(), 0.9) },
                    );
                }}
                onPaneClick={(event) => {
                    const now = Date.now();
                    const timeDiff = now - lastClickTime.current;
                    lastClickTime.current = now;

                    if (timeDiff < 400) {
                        // Detected a double click!
                        handlePaneDoubleClick(event);
                    } else {
                        // Single click
                        setSelectedNodes([]);
                        setActiveNode(null);
                    }
                }}
                zoomOnDoubleClick={false}
                nodeTypes={nodeTypes}
                panOnScroll
                selectionOnDrag={true}
                panOnDrag={[1, 2]}
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode="Shift"
                fitView
            >
                <Background color="hsl(var(--primary) / 0.1)" gap={24} size={1} />
                <Controls className="!bg-white !border-border/40 !rounded-md !shadow-sm" />
                <MiniMap
                    className="!bg-white !border-border/40 !rounded-md !shadow-sm"
                    maskColor="rgba(0,0,0,0.05)"
                    nodeColor={() => 'hsl(var(--primary))'}
                />
            </ReactFlow>
        </div>
    );
}
