import type { Edge, Node } from '@xyflow/react';

import type { PersistedNodeData } from '@/features/graph/types';

type PersistedGraphMock = {
    nodes: Node<PersistedNodeData>[];
    edges: Edge[];
};

export function createPersistedGraphMock(topicId: string): PersistedGraphMock {
    const nodes: Node<PersistedNodeData>[] = [
        createNode('topic:root', 'Climate Transition', topicId, undefined, 'topic', 'A long-lived topic with multiple branches and cross references.'),
        createNode('cluster:policy', 'Policy & Regulation', topicId, 'topic:root', 'cluster', 'Regulatory levers, subsidy structure, and emissions targets.'),
        createNode('cluster:infra', 'Infrastructure', topicId, 'topic:root', 'cluster', 'Grid upgrades, storage, interconnects, and operational constraints.'),
        createNode('cluster:industry', 'Industrial Adoption', topicId, 'topic:root', 'cluster', 'Demand-side adoption patterns and sector-by-sector blockers.'),
        createNode('claim:carbon-price', 'Carbon pricing accelerates capital rotation', topicId, 'cluster:policy', 'claim', 'Cap-and-trade or carbon tax changes investment timing.'),
        createNode('claim:permitting', 'Permitting delays dominate project timelines', topicId, 'cluster:policy', 'claim', 'Regulatory throughput is a larger bottleneck than engineering throughput in many regions.'),
        createNode('claim:grid-storage', 'Storage reduces grid congestion risk', topicId, 'cluster:infra', 'claim', 'Flexible storage changes dispatch patterns and reduces curtailment.'),
        createNode('claim:heat-pumps', 'Heat pump adoption depends on installer capacity', topicId, 'cluster:industry', 'claim', 'Workforce bottlenecks matter as much as consumer incentives.'),
        createNode('claim:steel', 'Green steel needs both power and demand guarantees', topicId, 'cluster:industry', 'claim', 'Supply-side decarbonization depends on long-term procurement certainty.'),
    ];

    const edges: Edge[] = [
        createContainsEdge('topic:root', 'cluster:policy'),
        createContainsEdge('topic:root', 'cluster:infra'),
        createContainsEdge('topic:root', 'cluster:industry'),
        createContainsEdge('cluster:policy', 'claim:carbon-price'),
        createContainsEdge('cluster:policy', 'claim:permitting'),
        createContainsEdge('cluster:infra', 'claim:grid-storage'),
        createContainsEdge('cluster:industry', 'claim:heat-pumps'),
        createContainsEdge('cluster:industry', 'claim:steel'),
        createRelationEdge('rel:permitting-grid', 'claim:permitting', 'claim:grid-storage'),
        createRelationEdge('rel:storage-steel', 'claim:grid-storage', 'claim:steel'),
        createRelationEdge('rel:carbon-heat-pumps', 'claim:carbon-price', 'claim:heat-pumps'),
    ];

    return { nodes, edges };
}

function createNode(
    id: string,
    label: string,
    topicId: string,
    parentId: string | undefined,
    kind: string,
    contextSummary: string,
): Node<PersistedNodeData> {
    return {
        id,
        type: 'customTask',
        position: { x: 0, y: 0 },
        data: {
            nodeSource: 'persisted',
            topicId,
            label,
            kind,
            parentId,
            contextSummary,
            contentMd: `# ${label}\n\n${contextSummary}`,
        },
    };
}

function createContainsEdge(source: string, target: string): Edge {
    return {
        id: `e-${source}-${target}`,
        source,
        target,
        animated: true,
    };
}

function createRelationEdge(id: string, source: string, target: string): Edge {
    return {
        id,
        source,
        target,
        animated: false,
        style: {
            stroke: '#64748b',
            strokeDasharray: '6 4',
            strokeWidth: 2,
        },
    };
}
