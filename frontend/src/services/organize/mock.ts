import type { OrganizePort, TopicNode, InputProgressStatus } from "./port";

// Internal mock state
let mockNodes: TopicNode[] = [
    {
        id: 'node-1',
        title: 'Central Theme',
        kind: 'theme',
        contextSummary: 'The main central theme of this topic, encompassing fundamental aspects of the research.',
        detailHtml: '<p>This is the top-level summary derived from the latest evidence set. It highlights the strongest common threads found across the input.</p><ul><li>Important point 1</li><li>Important point 2</li></ul>',
        contentMd: '# Central Theme\nThis node captures the main theme of the workspace.\n\n## Sub-components\nAs we can see below...',
        evidenceRefs: [
            { id: 'ev-1', title: 'Research Paper A', snippet: 'In the original paper, the central theme was debated heavily.' },
            { id: 'ev-2', title: 'Internal Wiki', url: 'https://wiki.example.com/topic' }
        ]
    },
    {
        id: 'node-2',
        title: 'Supporting Evidence',
        kind: 'evidence',
        parentId: 'node-1',
        contextSummary: 'Evidence to support the central theme.',
        contentMd: 'Here is some raw data supporting the parent node.'
    },
    {
        id: 'node-3',
        title: 'Counter Argument',
        kind: 'counterpoint',
        parentId: 'node-1'
    },
];

type Subscriber = (nodes: TopicNode[]) => void;
const subscribers: Set<Subscriber> = new Set();

const notifySubscribers = () => {
    subscribers.forEach(cb => cb([...mockNodes]));
};

export const mockOrganizeService: OrganizePort = {
    subscribeTree: (workspaceId, topicId, callback) => {
        subscribers.add(callback);
        // initial emit
        callback([...mockNodes]);
        return () => {
            subscribers.delete(callback);
        };
    },

    subscribeInputProgress: (_workspaceId, topicId, inputId, callback) => {
        let isSubscribed = true;
        const phases: InputProgressStatus[] = [
            "uploaded",
            "extracting",
            "atomizing",
            "resolving_topic",
            "updating_draft",
            "completed"
        ];

        // Return null initially
        callback(null);

        let phaseIndex = 0;

        const advancePhase = () => {
            if (!isSubscribed) return;
            if (phaseIndex >= phases.length) return;

            callback({
                inputId,
                topicId,
                workspaceId: _workspaceId,
                status: phases[phaseIndex],
            });

            phaseIndex++;
            if (phaseIndex < phases.length) {
                setTimeout(advancePhase, 2000);
            }
        };

        // Start simulation after short delay
        setTimeout(advancePhase, 500);

        return () => {
            isSubscribed = false;
        };
    },

    renameNode: async (_workspaceId, _topicId, nodeId, newTitle) => {
        await new Promise(resolve => setTimeout(resolve, 300)); // fake network
        mockNodes = mockNodes.map(n => n.id === nodeId ? { ...n, title: newTitle } : n);
        notifySubscribers();
    },

    deleteNode: async (workspaceId, topicId, nodeId) => {
        await new Promise(resolve => setTimeout(resolve, 400));
        // Remove the node itself AND optionally handle orphans (for now let's just detach orphans)
        mockNodes = mockNodes.map(n => n.parentId === nodeId ? { ...n, parentId: undefined } : n);
        mockNodes = mockNodes.filter(n => n.id !== nodeId);
        notifySubscribers();
    },

    moveNode: async (workspaceId, topicId, nodeId, newParentId) => {
        await new Promise(resolve => setTimeout(resolve, 300));
        mockNodes = mockNodes.map(n => n.id === nodeId ? { ...n, parentId: newParentId ?? undefined } : n);
        notifySubscribers();
    },

    uploadInput: async (_workspaceId, file) => {
        await new Promise(resolve => setTimeout(resolve, 800)); // simulate upload delay
        const inputId = `in_mock_${Date.now()}`;
        console.log(`[Mock] Upload: ${file.name} → ${inputId}`);
        return { inputId };
    },
};
