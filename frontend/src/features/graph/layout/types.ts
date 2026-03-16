import type { Edge, Node } from '@xyflow/react';

export type GraphLayoutMode = 'tree-act-cluster' | 'radial';

export type GraphLayoutInput = {
    layoutInputNodes: Node[];
    standaloneActNodes: Node[];
    layoutInputEdges: Edge[];
    actEdges: Edge[];
    previousNodes: Node[];
    hoveredNodeId?: string | null;
};

export type GraphLayoutResult = {
    nodes: Node[];
    edges: Edge[];
};
