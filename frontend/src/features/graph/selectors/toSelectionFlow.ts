import { Node, Edge } from '@xyflow/react';
import { SelectionGroup } from '@/features/agentInteraction/types';

export function toSelectionFlow(
    groups: Record<string, SelectionGroup>,
    existingNodes: Node[]
): { nodes: Node[], edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Simple layout strategy: 
    // If anchored, place to the right of anchor.
    // If not anchored, use a global "choice lane" starting at x: 800, y: 100
    let choiceLaneY = 100;

    Object.values(groups).forEach(group => {
        let baseX = 800;
        let baseY = choiceLaneY;

        if (group.anchor_node_id) {
            const anchor = existingNodes.find(n => n.id === group.anchor_node_id);
            if (anchor) {
                // Place to the right of the anchor node
                baseX = anchor.position.x + 300;
                baseY = anchor.position.y;

                // Add an edge from the anchor to the header
                edges.push({
                    id: `e-anchor-${anchor.id}-group-${group.selection_group_id}`,
                    source: anchor.id,
                    target: `group-${group.selection_group_id}`,
                    animated: true,
                    style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '5,5' } // amber border
                });
            }
        } else {
            // increment the choice lane
            choiceLaneY += 400 + (group.options.length * 150);
        }

        // 1. Create the Group Header Node
        nodes.push({
            id: `group-${group.selection_group_id}`,
            type: 'selectionHeader',
            position: { x: baseX, y: baseY },
            data: { ...group }
        });

        // 2. Create the Option Nodes stacked below the header
        group.options.forEach((opt, idx) => {
            const optY = baseY + 180 + (idx * 160); // spaced below header
            const optX = baseX + 20; // slight indent

            const optionNodeId = `opt-${group.selection_group_id}-${opt.option_id}`;
            nodes.push({
                id: optionNodeId,
                type: 'selectionNode',
                position: { x: optX, y: optY },
                data: {
                    ...opt,
                    groupId: group.selection_group_id,
                    selectionMode: group.selection_mode,
                    groupStatus: group.status
                }
            });

            // Edge from header to option
            edges.push({
                id: `e-group-${group.selection_group_id}-opt-${opt.option_id}`,
                source: `group-${group.selection_group_id}`,
                target: optionNodeId,
                animated: false,
                style: { stroke: '#fef3c7', strokeWidth: 2 } // subtle amber
            });
        });
    });

    return { nodes, edges };
}
