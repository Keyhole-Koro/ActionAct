import { Suspense } from 'react';
import { AppShell } from '@/features/layout/components/AppShell';
import { GraphCanvas } from '@/features/graph/components/GraphCanvas';

export default function Home() {
  return (
    <Suspense fallback={null}>
      <AppShell>
        <GraphCanvas />
      </AppShell>
    </Suspense>
  );
}
