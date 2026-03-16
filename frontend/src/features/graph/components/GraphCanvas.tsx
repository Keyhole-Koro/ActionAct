"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Background,
    Controls,
    Edge,
    MarkerType,
    MiniMap,
    Node,
    ReactFlow,
    SelectionMode,
    useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphCommands } from '@/features/graph/hooks/useGraphCommands';
import { useGraphStore } from '@/features/graph/store';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { actDraftService } from '@/services/actDraft/firestore';
import { organizeService } from '@/services/organize';

import { GraphNodeCard } from './GraphNodeCard';
import {
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '../constants/nodeDimensions';
import { RADIAL_CENTER_X, RADIAL_CENTER_Y } from '../layout/layoutRadial';
import { buildDisplayEdges, buildDisplayNodes } from '../selectors/projectGraph';
import { projectActOverlay } from '../selectors/projectActOverlay';
import { projectPersistedGraph } from '../selectors/projectPersistedGraph';
import type { GraphNodeBase, GraphNodeRender, PersistedNodeData } from '../types';
import { createPersistedGraphMock } from '../mocks/persistedGraphMock';

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
};

function isRenderableCoordinate(value: number | undefined) {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 20000;
}

function getDisplayNodeDimensions(node: GraphNodeRender) {
    if (node.data?.layoutMode === 'radial' && node.data?.nodeSource === 'persisted') {
        const radialDepth = typeof node.data.radialDepth === 'number' ? node.data.radialDepth : 0;
        const size = radialDepth === 0 ? 132 : (radialDepth === 1 ? 120 : (radialDepth === 2 ? 110 : 96));
        return { width: size, height: size };
    }

    const nodeKind = typeof node.data?.kind === 'string' ? node.data.kind : undefined;
    const label = typeof node.data?.label === 'string' ? node.data.label : undefined;
    const isExpanded = node.data?.isExpanded === true;
    const hasChildNodes = node.data?.hasChildNodes === true;
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

function overlapsWithMargin(left: GraphNodeRender, right: GraphNodeRender, margin = 28) {
    const leftDimensions = getDisplayNodeDimensions(left);
    const rightDimensions = getDisplayNodeDimensions(right);

    return !(
        left.position.x + leftDimensions.width + margin < right.position.x - margin
        || left.position.x - margin > right.position.x + rightDimensions.width + margin
        || left.position.y + leftDimensions.height + margin < right.position.y - margin
        || left.position.y - margin > right.position.y + rightDimensions.height + margin
    );
}

function midpointAngle(left: number, right: number) {
    let normalizedRight = right;
    if (normalizedRight < left) {
        normalizedRight += Math.PI * 2;
    }
    return (left + normalizedRight) / 2;
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
    return {
        x: cx + (Math.cos(angle) * radius),
        y: cy + (Math.sin(angle) * radius),
    };
}

function describeAnnularSector(
    cx: number,
    cy: number,
    innerRadius: number,
    outerRadius: number,
    startAngle: number,
    endAngle: number,
) {
    const startOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
    const endOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
    const startInner = polarToCartesian(cx, cy, innerRadius, startAngle);
    const endInner = polarToCartesian(cx, cy, innerRadius, endAngle);
    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

    return [
        `M ${startOuter.x} ${startOuter.y}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
        `L ${endInner.x} ${endInner.y}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInner.x} ${startInner.y}`,
        'Z',
    ].join(' ');
}

export function GraphCanvas() {
    const {
        persistedNodes,
        persistedEdges,
        actNodes,
        actEdges,
        setSelectedNodes,
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
    const commands = useGraphCommands({ workspaceId, topicId });
    const reactFlowInstance = useReactFlow();

    const setPersistedGraphRef = useRef(setPersistedGraph);
    const persistedNodeCountRef = useRef(0);
    const previousViewSignatureRef = useRef<string | null>(null);
    const [hoveredRadialRootId, setHoveredRadialRootId] = useState<string | null>(null);
    const usePersistedGraphMock = useMemo(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        return new URLSearchParams(window.location.search).get('graphMock') === '1';
    }, []);
    const persistedLayoutMode = useMemo(() => {
        if (typeof window === 'undefined') {
            return 'force' as const;
        }
        return new URLSearchParams(window.location.search).get('layout') === 'radial'
            ? 'radial' as const
            : 'force' as const;
    }, []);

    useEffect(() => {
        setPersistedGraphRef.current = setPersistedGraph;
    }, [setPersistedGraph]);

    useEffect(() => {
        if (usePersistedGraphMock) {
            const mock = createPersistedGraphMock(topicId);
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
        const allPersistedIds = new Set((persistedNodes as GraphNodeBase[]).map((node) => node.id));
        const rootIds = (persistedNodes as GraphNodeBase[])
            .filter((node) => {
                const parentId = typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
                return !parentId || !allPersistedIds.has(parentId);
            })
            .map((node) => node.id);

        return [...new Set([...rootIds, ...expandedBranchNodeIds])];
    }, [expandedBranchNodeIds, persistedNodes]);

    const persistedGraph = useMemo(
        () => projectPersistedGraph(
            persistedNodes as GraphNodeBase[],
            persistedEdges,
            effectiveExpandedBranchNodeIds,
            expandedNodeIds,
            persistedLayoutMode,
        ),
        [effectiveExpandedBranchNodeIds, expandedNodeIds, persistedEdges, persistedLayoutMode, persistedNodes],
    );
    const isRadialLayout = persistedLayoutMode === 'radial';

    const positionedActNodes = useMemo(
        () => projectActOverlay({
            actNodes: actNodes as GraphNodeBase[],
            persistedNodes: persistedGraph.positionedNodes,
            expandedNodeIds,
        }),
        [actNodes, expandedNodeIds, persistedGraph.positionedNodes],
    );

    const graphNodes = useMemo(
        () => [...persistedGraph.positionedNodes, ...positionedActNodes],
        [persistedGraph.positionedNodes, positionedActNodes],
    );

    const allReferenceableNodes = useMemo(
        () => [...persistedGraph.positionedNodes, ...positionedActNodes],
        [persistedGraph.positionedNodes, positionedActNodes],
    );

    const displayNodes = useMemo(
        () => buildDisplayNodes({
            nodes: graphNodes,
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
            graphNodes,
            persistedGraph.childrenByParent,
            persistedGraph.visibleNodeIds,
            selectedNodeIds,
            streamingNodeIds,
        ],
    );

    const layoutAwareDisplayNodes = useMemo(
        () => displayNodes.map((node) => {
            const layoutMode: 'force' | 'radial' = isRadialLayout && node.data?.nodeSource === 'persisted'
                ? 'radial'
                : 'force';

            return {
                ...node,
                data: {
                    ...node.data,
                    layoutMode,
                    radialDepth: persistedGraph.depthById.get(node.id) ?? 0,
                },
            };
        }),
        [displayNodes, isRadialLayout, persistedGraph.depthById],
    );

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
        const expandedNodes = normalizedDisplayNodes.filter((node) => node.data?.isExpanded === true);
        if (expandedNodes.length === 0) {
            return normalizedDisplayNodes;
        }

        return normalizedDisplayNodes.map((node) => {
            const isExpanded = node.data?.isExpanded === true;
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

    const displayEdges = useMemo(
        () => {
            if (isRadialLayout) {
                return [];
            }

            return buildDisplayEdges(
                [...persistedGraph.hierarchyEdges, ...persistedGraph.relationEdges],
                actEdges,
            ).map((edge) => {
            const isActContext = edge.id.startsWith('edge-ctx-');
            const isRelation = 'relationType' in edge && edge.relationType === 'related';
            const isActContextFocused = isActContext
                && (selectedNodeIds.includes(edge.source) || selectedNodeIds.includes(edge.target));
            const isRelationFocused = isRelation
                && (selectedNodeIds.includes(edge.source) || selectedNodeIds.includes(edge.target));

            return {
                ...edge,
                type: isActContext ? 'simplebezier' : (isRelation ? 'smoothstep' : 'default'),
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
                labelStyle: isActContextFocused
                    ? {
                        fill: '#0f766e',
                        fontSize: 11,
                        fontWeight: 600,
                    }
                    : undefined,
                labelBgStyle: isActContextFocused
                    ? {
                        fill: 'rgba(248, 250, 252, 0.92)',
                        fillOpacity: 1,
                    }
                    : undefined,
                labelBgPadding: isActContextFocused ? [6, 3] as [number, number] : undefined,
                labelBgBorderRadius: isActContextFocused ? 6 : undefined,
                style: {
                    stroke: isActContext
                        ? (isActContextFocused ? '#0f766e' : '#64748b')
                        : (isRelation ? (isRelationFocused ? '#64748b' : '#cbd5e1') : 'var(--primary)'),
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
        [actEdges, isRadialLayout, persistedGraph.hierarchyEdges, persistedGraph.relationEdges, selectedNodeIds],
    );

    const radialOverlay = useMemo(() => {
        if (!isRadialLayout) {
            return null;
        }

        const persistedDisplayNodes = emphasizedDisplayNodes.filter((node) => node.data?.nodeSource === 'persisted');
        if (persistedDisplayNodes.length === 0) {
            return null;
        }

        const rootNodes = persistedDisplayNodes.filter((node) => persistedGraph.rootIds.includes(node.id));
        const rootCenters = rootNodes.map((node) => {
            const dimensions = getDisplayNodeDimensions(node);
            return {
                x: node.position.x + (dimensions.width / 2),
                y: node.position.y + (dimensions.height / 2),
            };
        });
        const center = rootCenters.length > 0
            ? {
                x: rootCenters.reduce((sum, point) => sum + point.x, 0) / rootCenters.length,
                y: rootCenters.reduce((sum, point) => sum + point.y, 0) / rootCenters.length,
            }
            : { x: RADIAL_CENTER_X, y: RADIAL_CENTER_Y };

        const depthGroups = new Map<number, Array<{ x: number; y: number }>>();
        persistedDisplayNodes.forEach((node) => {
            const depth = persistedGraph.depthById.get(node.id) ?? 0;
            const dimensions = getDisplayNodeDimensions(node);
            const point = {
                x: node.position.x + (dimensions.width / 2),
                y: node.position.y + (dimensions.height / 2),
            };
            const group = depthGroups.get(depth) ?? [];
            group.push(point);
            depthGroups.set(depth, group);
        });

        const circles = [...depthGroups.entries()]
            .sort((left, right) => left[0] - right[0])
            .map(([depth, points]) => {
                const radius = points.reduce((sum, point) => {
                    const dx = point.x - center.x;
                    const dy = point.y - center.y;
                    return sum + Math.sqrt((dx * dx) + (dy * dy));
                }, 0) / Math.max(points.length, 1);
                return { depth, radius };
            });

        const rootSectors = rootNodes
            .map((node) => {
                const dimensions = getDisplayNodeDimensions(node);
                const x = node.position.x + (dimensions.width / 2);
                const y = node.position.y + (dimensions.height / 2);
                return {
                    id: node.id,
                    label: node.data?.label ?? node.id,
                    angle: Math.atan2(y - center.y, x - center.x),
                };
            })
            .sort((left, right) => left.angle - right.angle)
            .map((root, index, roots) => {
                const previous = roots[(index - 1 + roots.length) % roots.length];
                const next = roots[(index + 1) % roots.length];
                const startAngle = midpointAngle(previous.angle, root.angle);
                const endAngle = midpointAngle(root.angle, next.angle);
                return {
                    id: root.id,
                    label: root.label,
                    startAngle,
                    endAngle: endAngle <= startAngle ? endAngle + (Math.PI * 2) : endAngle,
                };
            });

        const rays = persistedDisplayNodes
            .filter((node) => (persistedGraph.depthById.get(node.id) ?? 0) > 0)
            .map((node) => {
                const dimensions = getDisplayNodeDimensions(node);
                return {
                    id: node.id,
                    x: node.position.x + (dimensions.width / 2),
                    y: node.position.y + (dimensions.height / 2),
                };
            });

        return { center, circles, rays, rootSectors };
    }, [emphasizedDisplayNodes, isRadialLayout, persistedGraph.depthById, persistedGraph.rootIds]);

    const focusNode = useCallback((nodeId: string) => {
        const targetNode = emphasizedDisplayNodes.find((node) => node.id === nodeId);
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
    }, [emphasizedDisplayNodes, reactFlowInstance, setActiveNode]);

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

    useEffect(() => {
        if (emphasizedDisplayNodes.length === 0) {
            previousViewSignatureRef.current = null;
            return;
        }

        if (viewSignature === previousViewSignatureRef.current) {
            return;
        }
        previousViewSignatureRef.current = viewSignature;

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
    }, [emphasizedDisplayNodes.length, reactFlowInstance, viewSignature]);

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

    return (
        <div className="relative h-full w-full" onDoubleClick={handlePaneDoubleClick}>
            {radialOverlay && (
                <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full">
                    {radialOverlay.rootSectors.flatMap((sector, sectorIndex) => (
                        radialOverlay.circles.map((circle, circleIndex) => {
                            const previousRadius = circleIndex === 0
                                ? Math.max(circle.radius - 84, 36)
                                : radialOverlay.circles[circleIndex - 1].radius + 24;
                            const nextRadius = circle.radius + 56;
                            const fillPalette = [
                                'rgba(226,232,240,0.16)',
                                'rgba(191,219,254,0.12)',
                                'rgba(196,181,253,0.12)',
                                'rgba(167,243,208,0.12)',
                            ];
                            const isHoveredSector = hoveredRadialRootId === sector.id;

                            return (
                                <path
                                    key={`radial-sector-${sector.id}-${circle.depth}`}
                                    d={describeAnnularSector(
                                        radialOverlay.center.x,
                                        radialOverlay.center.y,
                                        previousRadius,
                                        nextRadius,
                                        sector.startAngle,
                                        sector.endAngle,
                                    )}
                                    fill={isHoveredSector
                                        ? fillPalette[(sectorIndex + circleIndex) % fillPalette.length].replace('0.12', '0.24').replace('0.16', '0.28')
                                        : fillPalette[(sectorIndex + circleIndex) % fillPalette.length]}
                                    stroke={isHoveredSector ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.28)'}
                                    strokeWidth={isHoveredSector ? '1.5' : '1'}
                                />
                            );
                        })
                    ))}
                    {radialOverlay.rays.map((ray) => (
                        <line
                            key={`radial-ray-${ray.id}`}
                            x1={radialOverlay.center.x}
                            y1={radialOverlay.center.y}
                            x2={ray.x}
                            y2={ray.y}
                            stroke="rgba(148,163,184,0.24)"
                            strokeWidth="1.5"
                        />
                    ))}
                </svg>
            )}
            {radialOverlay && (
                <div className="pointer-events-none absolute inset-0 z-10">
                    {radialOverlay.rootSectors.map((sector, index) => {
                        const labelRadius = (radialOverlay.circles[0]?.radius ?? 180) + 54;
                        const angle = (sector.startAngle + sector.endAngle) / 2;
                        const point = polarToCartesian(
                            radialOverlay.center.x,
                            radialOverlay.center.y,
                            labelRadius,
                            angle,
                        );
                        const isHoveredSector = hoveredRadialRootId === sector.id;

                        return (
                            <button
                                key={`radial-sector-button-${sector.id}`}
                                type="button"
                                className={[
                                    'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1.5 text-[11px] font-semibold',
                                    'backdrop-blur-sm transition-all duration-200',
                                    isHoveredSector
                                        ? 'border-slate-400 bg-white/96 text-slate-900 shadow-md'
                                        : 'border-white/80 bg-white/82 text-slate-600 shadow-sm',
                                ].join(' ')}
                                style={{
                                    left: point.x,
                                    top: point.y,
                                }}
                                onMouseEnter={() => setHoveredRadialRootId(sector.id)}
                                onMouseLeave={() => setHoveredRadialRootId(null)}
                                onFocus={() => setHoveredRadialRootId(sector.id)}
                                onBlur={() => setHoveredRadialRootId(null)}
                                onClick={() => focusNode(sector.id)}
                            >
                                {sector.label}
                            </button>
                        );
                    })}
                </div>
            )}
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
                nodesDraggable={false}
                panOnScroll
                selectionOnDrag
                panOnDrag={[1, 2]}
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode="Shift"
                fitView
            >
                <Background color="var(--border)" gap={24} size={1} />
                <Controls className="!rounded-md !border-border/40 !bg-white !shadow-sm" />
                <MiniMap
                    className="!rounded-md !border-border/40 !bg-white !shadow-sm"
                    maskColor="rgba(0,0,0,0.05)"
                    nodeColor={() => 'var(--primary)'}
                />
            </ReactFlow>
        </div>
    );
}
