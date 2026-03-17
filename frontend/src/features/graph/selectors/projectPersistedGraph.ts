import type { GraphNodeBase } from '@/features/graph/types';
import { layoutPersistedForce } from '@/features/graph/layout/layoutForce';
import { layoutPersistedRadial } from '@/features/graph/layout/layoutRadial';
import { layoutOrbit } from '@/features/graph/layout/layoutOrbit';
import { buildVisibleHierarchy, type GraphEdgeLike } from '@/features/graph/model/hierarchy';
import { partitionVisibleEdges } from '@/features/graph/model/relations';

export type PersistedGraphProjection = ReturnType<typeof projectPersistedGraph>;
export type PersistedGraphLayoutMode = 'force' | 'radial' | 'orbit';

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
        (layoutMode === 'radial' || layoutMode === 'orbit')
            ? persistedNodes.map((node) => node.id)
            : expandedBranchNodeIds,
    );
    const relations = partitionVisibleEdges(hierarchy.visibleNodes, hierarchy.visibleEdges);

    let positionedNodes: GraphNodeBase[];
    if (layoutMode === 'radial') {
        positionedNodes = layoutPersistedRadial({
            nodes: hierarchy.visibleNodes,
            depthById: hierarchy.depthById,
            rootIds: hierarchy.rootIds,
            childrenByParent: hierarchy.childrenByParent,
        });
    } else if (layoutMode === 'orbit') {
        positionedNodes = layoutOrbit({
            nodes: hierarchy.visibleNodes,
            rootIds: hierarchy.rootIds,
            childrenByParent: hierarchy.childrenByParent,
            actNodes: actNodes ?? [],
        });
    } else {
        positionedNodes = layoutPersistedForce({
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
    }

    return {
        ...hierarchy,
        positionedNodes,
        hierarchyEdges: relations.hierarchyEdges,
        relationEdges: relations.relationEdges,
    };
}
