import { Suspense } from 'react';
import { AppShell } from '@/features/layout/components/AppShell';
import { GraphCanvas } from '@/features/graph/components/GraphCanvas';
import { ReactFlowProvider } from '@xyflow/react';

export default function Home() {
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
