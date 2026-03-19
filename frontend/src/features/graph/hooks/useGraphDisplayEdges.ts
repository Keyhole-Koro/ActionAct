import { useMemo } from 'react';
import { Edge, Node, MarkerType } from '@xyflow/react';
import { useStreamPreferencesStore } from '@/features/agentTools/store/stream-preferences-store';
import { buildDisplayEdges } from '../selectors/projectGraph';
import { projectPersistedGraph } from '../selectors/projectPersistedGraph';
import {
    getDisplayNodeDimensions,
    resolveNearestSides,
} from '../components/graphCanvas/graphCanvasUtils';
import type { GraphNodeRender } from '../types';

const RADIAL_ROOT_HUES = [198, 256, 148, 34, 320, 82, 12, 228];

interface UseGraphDisplayEdgesOptions {
    isRadialLayout: boolean;
    emphasizedDisplayNodes: Node[];
    actEdges: Edge[];
    actChildrenByParent: Map<string, string[]>;
    selectionProjectionEdges: Edge[];
    persistedGraph: ReturnType<typeof projectPersistedGraph>;
    persistedRootIdByNode: Map<string, string>;
    selectedNodeIds: string[];
}

export function useGraphDisplayEdges({
    isRadialLayout,
    emphasizedDisplayNodes,
    actEdges,
    actChildrenByParent,
    selectionProjectionEdges,
    persistedGraph,
    persistedRootIdByNode,
    selectedNodeIds,
}: UseGraphDisplayEdgesOptions): Edge[] {
    const autoRouteEdgeHandles = useStreamPreferencesStore((state) => state.autoRouteEdgeHandles);

    const displayEdges = useMemo(
        () => {
            if (isRadialLayout) {
                return [];
            }

            const nodeById = new Map(emphasizedDisplayNodes.map((node) => [node.id, node]));

            // Straight edges connecting act parent → child nodes
            const actParentChildEdges: Edge[] = [];
            for (const [parentId, childIds] of actChildrenByParent) {
                for (const childId of childIds) {
                    actParentChildEdges.push({
                        id: `edge-act-${parentId}-${childId}`,
                        source: parentId,
                        target: childId,
                    });
                }
            }

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

            // Precompute rootId → index Map so edge loop is O(1) instead of O(n) per edge
            const rootIdToIndex = new Map(persistedGraph.rootIds.map((id, i) => [id, i]));

            return buildDisplayEdges(
                [...persistedGraph.hierarchyEdges, ...persistedGraph.relationEdges],
                [...actEdges, ...actParentChildEdges, ...selectionProjectionEdges],
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
                const rootIndex = rootId ? (rootIdToIndex.get(rootId) ?? -1) : -1;
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
            actChildrenByParent,
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
            selectionProjectionEdges,
        ],
    );

    return displayEdges;
}
