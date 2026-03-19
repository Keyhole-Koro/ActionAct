import { Suspense } from 'react';
import { ReactFlowProvider } from '@xyflow/react';

import { AppShell } from '@/features/layout/components/AppShell';
import { GraphCanvas } from '@/features/graph/components/GraphCanvas';

export default function WorkspacePage() {
    return (
        <Suspense fallback={null}>
            <ReactFlowProvider>
                <AppShell>
                    <GraphCanvas />
                </AppShell>
            </ReactFlowProvider>
        </Suspense>
    );
}
