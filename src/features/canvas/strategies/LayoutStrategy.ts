import ELK from 'elkjs/lib/elk.bundled.js';
import { Node, Edge } from '@xyflow/react';

const elk = new ELK();

export interface LayoutStrategy {
  execute(nodes: Node[], edges: Edge[]): Promise<Node[]>;
}

export class ElkLayoutStrategy implements LayoutStrategy {
  async execute(nodes: Node[], edges: Edge[]): Promise<Node[]> {
    const graph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '80',
        'elk.layered.spacing.nodeNodeLayered': '100',
      },
      children: nodes.map((node) => ({
        id: node.id,
        width: 180,
        height: 80,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    };

    const layoutedGraph = await elk.layout(graph as any);

    return nodes.map((node) => {
      const nodeWithPosition = layoutedGraph.children?.find((n) => n.id === node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition?.x || 0,
          y: nodeWithPosition?.y || 0,
        },
      };
    });
  }
}