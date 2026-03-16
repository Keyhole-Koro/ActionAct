import type { Edge, Node } from '@xyflow/react';

import { getLayoutedElements } from '@/features/graph/utils/layout';
import { getRadialLayout } from '@/features/graph/utils/radialLayout';

import type { GraphLayoutInput, GraphLayoutMode, GraphLayoutResult } from './types';

async function runTreeActClusterLayout(input: GraphLayoutInput): Promise<GraphLayoutResult> {
    return getLayoutedElements(
        input.layoutInputNodes,
        input.layoutInputEdges,
        'LR',
        { nodes: input.previousNodes },
    );
}

async function runRadialLayout(input: GraphLayoutInput): Promise<GraphLayoutResult> {
    const allNodes = [...input.layoutInputNodes, ...input.standaloneActNodes] as Node[];
    const allEdges = [...input.layoutInputEdges, ...input.actEdges] as Edge[];
    const radialPositions = getRadialLayout(allNodes, allEdges, input.hoveredNodeId ?? null);
    return {
        nodes: allNodes.map((node) => {
            const pos = radialPositions.get(node.id);
            if (!pos) {
                return node;
            }
            return {
                ...node,
                position: { x: pos.x, y: pos.y },
            };
        }),
        edges: allEdges,
    };
}

export async function orchestrateGraphLayout(
    mode: GraphLayoutMode,
    input: GraphLayoutInput,
): Promise<GraphLayoutResult> {
    switch (mode) {
        case 'radial':
            return runRadialLayout(input);
        case 'tree-act-cluster':
        default:
            return runTreeActClusterLayout(input);
    }
}
