import { Node, Edge, Position } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled';

const elk = new ELK();

// Default node dimensions
const nodeWidth = 260;
const nodeHeight = 160;

export async function getLayoutedElements(nodes: Node[], edges: Edge[], direction = 'TB'): Promise<{ nodes: Node[], edges: Edge[] }> {
    const isHorizontal = direction === 'LR';

    const graph = {
        id: 'root',
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': direction === 'TB' ? 'DOWN' : 'RIGHT',
            'elk.layered.spacing.nodeNodeBetweenLayers': '60',
            'elk.spacing.nodeNode': '40',
        },
        children: nodes.map((node) => {
            const width = node.type === 'selectionHeader' ? 420 : nodeWidth;
            const height = node.type === 'selectionHeader' ? 200 : nodeHeight;
            return {
                id: node.id,
                width,
                height,
            };
        }),
        edges: edges.map((edge) => ({
            id: edge.id,
            sources: [edge.source],
            targets: [edge.target],
        })),
    };

    try {
        const layoutedGraph = await elk.layout(graph);

        const newNodes = nodes.map((node) => {
            const layoutedNode = layoutedGraph.children?.find((n) => n.id === node.id);

            // Set handle positions
            node.targetPosition = isHorizontal ? Position.Left : Position.Top;
            node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

            return {
                ...node,
                position: {
                    x: layoutedNode?.x ?? node.position.x,
                    y: layoutedNode?.y ?? node.position.y,
                },
            };
        });

        return { nodes: newNodes, edges };
    } catch (e) {
        console.error("ELK layout failed", e);
        return { nodes, edges };
    }
}
