import { OrganizePort, TopicNode } from './port';

// Internal mock state
let mockNodes: TopicNode[] = [
    {
        id: 'node-1',
        title: 'Central Theme',
        type: 'concept',
        contextSummary: 'The main central theme of this topic, encompassing fundamental aspects of the research.',
        detailHtml: '<p>This is the core concept derived from the initial upload. It represents a synthesis of <strong>various key elements</strong> found in the evidence.</p><ul><li>Important point 1</li><li>Important point 2</li></ul>',
        contentMd: '# Central Theme\nThis concept aims to unify the understanding of the entire workspace.\n\n## Sub-components\nAs we can see below...',
        evidenceRefs: [
            { id: 'ev-1', title: 'Research Paper A', snippet: 'In the original paper, the central theme was debated heavily.' },
            { id: 'ev-2', title: 'Internal Wiki', url: 'https://wiki.example.com/topic' }
        ]
    },
    {
        id: 'node-2',
        title: 'Supporting Evidence',
        type: 'detail',
        parentId: 'node-1',
        contextSummary: 'Evidence to support the central theme.',
        contentMd: 'Here is some raw data supporting the root concept.'
    },
    {
        id: 'node-3',
        title: 'Counter Argument',
        type: 'detail',
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

    renameNode: async (workspaceId, topicId, nodeId, newTitle) => {
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

    uploadInput: async (_workspaceId, _topicId, file) => {
        await new Promise(resolve => setTimeout(resolve, 800)); // simulate upload delay
        const inputId = `in_mock_${Date.now()}`;
        console.log(`[Mock] Upload: ${file.name} → ${inputId}`);
        return { inputId };
    },
};
