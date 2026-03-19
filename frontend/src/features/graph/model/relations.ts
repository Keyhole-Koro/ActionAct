import type { GraphNodeBase } from '@/features/graph/types';
import type { GraphEdgeLike } from './hierarchy';

export type WeightedRelationEdge = GraphEdgeLike & {
    relationType: 'contains' | 'related';
    strength: number;
    distance: number;
};

export function partitionVisibleEdges(
    visibleNodes: GraphNodeBase[],
    visibleEdges: GraphEdgeLike[],
): {
    hierarchyEdges: WeightedRelationEdge[];
    relationEdges: WeightedRelationEdge[];
} {
    const nodeById = new Map(visibleNodes.map((node) => [node.id, node]));
    const hierarchyEdges: WeightedRelationEdge[] = [];
    const relationEdges: WeightedRelationEdge[] = [];

    for (const edge of visibleEdges) {
        const targetNode = nodeById.get(edge.target);
        const parentId = typeof targetNode?.data?.parentId === 'string' ? targetNode.data.parentId : undefined;
        const isHierarchy = parentId === edge.source;

        const weighted: WeightedRelationEdge = {
            ...edge,
            relationType: isHierarchy ? 'contains' : 'related',
            strength: isHierarchy ? 0.18 : 0.018,
            distance: isHierarchy ? 320 : 520,
        };

        if (isHierarchy) {
            hierarchyEdges.push(weighted);
        } else {
            relationEdges.push(weighted);
        }
    }

    return { hierarchyEdges, relationEdges };
}
