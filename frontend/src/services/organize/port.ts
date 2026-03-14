export interface TopicNode {
    id: string;
    title: string;
    type: string;
    parentId?: string;
    // simplified for mock UI purposes
}

export interface OrganizePort {
    subscribeTree: (workspaceId: string, topicId: string, callback: (nodes: TopicNode[]) => void) => () => void;
    // additional methods will be added as required
}
