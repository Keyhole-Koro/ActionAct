import { ActPort, PatchOp } from './port';
import { v4 as uuidv4 } from 'uuid';

export const mockActService: ActPort = {
    streamAct: (query, onPatch, onDone, onError) => {
        let isCancelled = false;
        let step = 0;

        const rootId = `mock-node-${Date.now()}`;
        const childId1 = `mock-child1-${Date.now()}`;
        const childId2 = `mock-child2-${Date.now()}`;

        const patches: PatchOp[] = [
            // 1. Create a root concept node
            { type: 'upsert', nodeId: rootId, data: { label: 'Thinking...', type: 'concept' } },

            // 2. Start streaming markdown to root
            { type: 'append_md', nodeId: rootId, data: { contentMd: '# ' + query + '\n\n' } },
            { type: 'append_md', nodeId: rootId, data: { contentMd: 'Based on your query, we can break this down into key areas.\n' } },

            // 3. Update root label
            { type: 'upsert', nodeId: rootId, data: { label: 'Query Analysis', type: 'concept' } },

            // 4. Upsert a child node
            { type: 'upsert', nodeId: childId1, data: { label: 'Sub-topic A', type: 'detail' } },
            { type: 'append_md', nodeId: childId1, data: { contentMd: 'This is the first detail related to the query.' } },

            // 5. Upsert another child node
            { type: 'upsert', nodeId: childId2, data: { label: 'Sub-topic B', type: 'detail' } },
            { type: 'append_md', nodeId: childId2, data: { contentMd: 'This is the second detail.' } },
        ];

        const timer = setInterval(() => {
            if (isCancelled) {
                clearInterval(timer);
                return;
            }
            if (step < patches.length) {
                onPatch(patches[step]);
                step++;
            } else {
                clearInterval(timer);
                onDone();
            }
        }, 800); // Send a patch every 800ms to simulate thinking

        return () => {
            isCancelled = true;
            clearInterval(timer);
        };
    }
};
