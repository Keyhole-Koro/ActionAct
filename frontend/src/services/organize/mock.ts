import { OrganizePort, TopicNode } from './port';

const MOCK_NODES: TopicNode[] = [
    { id: '1', title: 'Root Idea', type: 'concept' },
    { id: '2', title: 'Specific Detail A', type: 'detail', parentId: '1' },
    { id: '3', title: 'Specific Detail B', type: 'detail', parentId: '1' },
];

export const mockOrganizeService: OrganizePort = {
    subscribeTree: (workspaceId, topicId, callback) => {
        // Send initial snapshot
        setTimeout(() => {
            callback(MOCK_NODES);
        }, 100);

        // Return unsubscribe function
        return () => console.log('Unsubscribed mock tree');
    }
};
