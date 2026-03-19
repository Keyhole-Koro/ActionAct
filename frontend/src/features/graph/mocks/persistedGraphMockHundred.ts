import type { Edge, Node } from '@xyflow/react';

import type { PersistedNodeData } from '@/features/graph/types';

type PersistedGraphMock = {
    nodes: Node<PersistedNodeData>[];
    edges: Edge[];
};

const ROOTS = [
    { id: 'topic:systems', label: 'Systems Transition', summary: 'Large-scale systems change across infrastructure and institutions.' },
    { id: 'topic:industry', label: 'Industrial Shift', summary: 'Operational change in heavy industry, logistics, and materials.' },
    { id: 'topic:public', label: 'Public Capacity', summary: 'Administrative, community, and delivery capability for execution.' },
    { id: 'topic:resilience', label: 'Resilience', summary: 'Reliability, redundancy, and adaptation under stress.' },
] as const;

const CLUSTER_LABELS = [
    ['Policy Design', 'Grid Delivery', 'Permitting Flow', 'Capital Programs'],
    ['Process Heat', 'Materials Supply', 'Fleet Conversion', 'Factory Learning'],
    ['Training Systems', 'Community Trust', 'Local Governance', 'Service Ops'],
    ['Buffers & Redundancy', 'Critical Inputs', 'Emergency Response', 'Interoperability'],
] as const;

const SUBCLUSTER_LABELS = [
    ['Market Signals', 'Implementation'],
    ['Bottlenecks', 'Upgrades'],
    ['Coordination', 'Traceability'],
    ['Execution', 'Metrics'],
] as const;

export function createPersistedGraphMockHundred(topicId: string): PersistedGraphMock {
    const nodes: Node<PersistedNodeData>[] = [];
    const edges: Edge[] = [];
    const claimIds: string[] = [];

    ROOTS.forEach((root) => {
        nodes.push(createNode(root.id, root.label, topicId, undefined, 'topic', root.summary));
    });

    ROOTS.forEach((root, rootIndex) => {
        CLUSTER_LABELS[rootIndex].forEach((clusterLabel, clusterIndex) => {
            const clusterId = `cluster:${rootIndex}:${clusterIndex}`;
            nodes.push(
                createNode(
                    clusterId,
                    clusterLabel,
                    topicId,
                    root.id,
                    'cluster',
                    `${clusterLabel} controls how ${root.label.toLowerCase()} becomes executable work.`,
                ),
            );
            edges.push(createContainsEdge(root.id, clusterId));

            SUBCLUSTER_LABELS[clusterIndex].forEach((subclusterLabel, subclusterIndex) => {
                const subclusterId = `subcluster:${rootIndex}:${clusterIndex}:${subclusterIndex}`;
                nodes.push(
                    createNode(
                        subclusterId,
                        subclusterLabel,
                        topicId,
                        clusterId,
                        'subcluster',
                        `${subclusterLabel} shapes how ${clusterLabel.toLowerCase()} gets coordinated in practice.`,
                    ),
                );
                edges.push(createContainsEdge(clusterId, subclusterId));

                const claimCount = subclusterIndex === 0 ? 2 : 1;
                for (let claimIndex = 0; claimIndex < claimCount; claimIndex += 1) {
                    const claimId = `claim:${rootIndex}:${clusterIndex}:${subclusterIndex}:${claimIndex}`;
                    const claimLabel = claimIndex === 0
                        ? `${subclusterLabel} drives throughput`
                        : `${subclusterLabel} reveals hidden delays`;
                    nodes.push(
                        createNode(
                            claimId,
                            claimLabel,
                            topicId,
                            subclusterId,
                            'claim',
                            `${claimLabel} within ${clusterLabel.toLowerCase()} depends on repeated operational choices and local constraints.`,
                        ),
                    );
                    edges.push(createContainsEdge(subclusterId, claimId));
                    claimIds.push(claimId);
                }
            });
        });
    });

    claimIds.forEach((sourceId, index) => {
        const targetId = claimIds[(index + 7) % claimIds.length];
        if (sourceId !== targetId) {
            edges.push(createRelationEdge(`rel:claim:${index}`, sourceId, targetId));
        }
    });

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
