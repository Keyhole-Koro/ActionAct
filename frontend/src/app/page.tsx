import { AppShell } from '@/features/layout/components/AppShell';
import { GraphCanvas } from '@/features/graph/components/GraphCanvas';

export default function Home() {
  return (
    <AppShell>
      <GraphCanvas />
    </AppShell>
  );
}
