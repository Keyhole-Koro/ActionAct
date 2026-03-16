import type { GraphNodeBase } from '@/features/graph/types';
import { layoutPersistedForce } from '@/features/graph/layout/layoutForce';
import { buildVisibleHierarchy, type GraphEdgeLike } from '@/features/graph/model/hierarchy';
import { partitionVisibleEdges } from '@/features/graph/model/relations';

export type PersistedGraphProjection = ReturnType<typeof projectPersistedGraph>;

export function projectPersistedGraph(
    persistedNodes: GraphNodeBase[],
    persistedEdges: GraphEdgeLike[],
    expandedBranchNodeIds: string[],
    expandedNodeIds: string[],
) {
    const hierarchy = buildVisibleHierarchy(persistedNodes, persistedEdges, expandedBranchNodeIds);
    const relations = partitionVisibleEdges(hierarchy.visibleNodes, hierarchy.visibleEdges);
    const positionedNodes = layoutPersistedForce({
        nodes: hierarchy.visibleNodes,
        edges: [...relations.hierarchyEdges, ...relations.relationEdges],
        depthById: hierarchy.depthById,
        rootIds: hierarchy.rootIds,
        expandedNodeIds: new Set(expandedNodeIds),
        previousPositions: new Map(
            hierarchy.visibleNodes.map((node) => [
                node.id,
                {
                    x: node.position.x,
                    y: node.position.y,
                },
            ]),
        ),
        childrenByParent: hierarchy.childrenByParent,
    });

    return {
        ...hierarchy,
        positionedNodes,
        hierarchyEdges: relations.hierarchyEdges,
        relationEdges: relations.relationEdges,
    };
}
