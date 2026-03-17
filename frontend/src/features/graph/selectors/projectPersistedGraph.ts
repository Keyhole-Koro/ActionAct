import type { GraphNodeBase } from '@/features/graph/types';
import { layoutPersistedForce } from '@/features/graph/layout/layoutForce';
import { layoutPersistedRadial } from '@/features/graph/layout/layoutRadial';
import { buildVisibleHierarchy, type GraphEdgeLike } from '@/features/graph/model/hierarchy';
import { partitionVisibleEdges } from '@/features/graph/model/relations';

export type PersistedGraphProjection = ReturnType<typeof projectPersistedGraph>;
export type PersistedGraphLayoutMode = 'force' | 'radial' | 'sphere';

export function projectPersistedGraph(
    persistedNodes: GraphNodeBase[],
    persistedEdges: GraphEdgeLike[],
    expandedBranchNodeIds: string[],
    expandedNodeIds: string[],
    layoutMode: PersistedGraphLayoutMode = 'force',
    actNodes?: GraphNodeBase[],
    actEdges?: GraphEdgeLike[],
) {
    const hierarchy = buildVisibleHierarchy(
        persistedNodes,
        persistedEdges,
        layoutMode === 'radial' ? persistedNodes.map((node) => node.id) : expandedBranchNodeIds,
    );
    const relations = partitionVisibleEdges(hierarchy.visibleNodes, hierarchy.visibleEdges);
    const positionedNodes = layoutMode === 'radial'
        ? layoutPersistedRadial({
            nodes: hierarchy.visibleNodes,
            depthById: hierarchy.depthById,
            rootIds: hierarchy.rootIds,
            childrenByParent: hierarchy.childrenByParent,
        })
        : layoutPersistedForce({
            nodes: hierarchy.visibleNodes,
            edges: [...relations.hierarchyEdges, ...relations.relationEdges],
            depthById: hierarchy.depthById,
            rootIds: hierarchy.rootIds,
            expandedNodeIds: new Set(expandedNodeIds),
            previousPositions: new Map(
                [...hierarchy.visibleNodes, ...(actNodes ?? [])].map((node) => [
                    node.id,
                    { x: node.position.x, y: node.position.y },
                ]),
            ),
            childrenByParent: hierarchy.childrenByParent,
            actNodes: actNodes ?? [],
            actEdges: actEdges ?? [],
        });

    return {
        ...hierarchy,
        positionedNodes,
        hierarchyEdges: relations.hierarchyEdges,
        relationEdges: relations.relationEdges,
    };
}
