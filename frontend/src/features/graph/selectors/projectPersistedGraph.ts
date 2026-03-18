import type { GraphNodeBase } from '@/features/graph/types';
import { layoutPersistedRadial } from '@/features/graph/layout/layoutRadial';
import { layoutOrbit } from '@/features/graph/layout/layoutOrbit';
import { buildVisibleHierarchy, type GraphEdgeLike } from '@/features/graph/model/hierarchy';
import { partitionVisibleEdges } from '@/features/graph/model/relations';

export type PersistedGraphProjection = ReturnType<typeof projectPersistedGraph>;
export type PersistedGraphLayoutMode = 'radial' | 'orbit';

export function projectPersistedGraph(
    persistedNodes: GraphNodeBase[],
    persistedEdges: GraphEdgeLike[],
    layoutMode: PersistedGraphLayoutMode = 'radial',
    expandedBranchNodeIds?: string[],
    actNodes?: GraphNodeBase[],
) {
    // radial overview always shows all nodes; orbit respects user expansion state
    const expandedIds = layoutMode === 'radial' || expandedBranchNodeIds === undefined
        ? persistedNodes.map((node) => node.id)
        : expandedBranchNodeIds;

    const hierarchy = buildVisibleHierarchy(
        persistedNodes,
        persistedEdges,
        expandedIds,
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
    } else {
        positionedNodes = layoutOrbit({
            nodes: hierarchy.visibleNodes,
            rootIds: hierarchy.rootIds,
            childrenByParent: hierarchy.childrenByParent,
            actNodes: actNodes ?? [],
        });
    }

    return {
        ...hierarchy,
        positionedNodes,
        hierarchyEdges: relations.hierarchyEdges,
        relationEdges: relations.relationEdges,
    };
}
