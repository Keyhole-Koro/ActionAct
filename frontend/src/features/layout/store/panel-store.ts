import { create } from 'zustand';

export type RightPanelMode = 'node-detail' | 'topic-activity' | 'review-inbox';

interface PanelState {
    isOpen: boolean;
    mode: RightPanelMode;
    selectedNodeId: string | null;
    openPanel: (mode: RightPanelMode, nodeId?: string) => void;
    closePanel: () => void;
    setMode: (mode: RightPanelMode) => void;
}

export const usePanelStore = create<PanelState>((set) => ({
    isOpen: false,
    mode: 'node-detail',
    selectedNodeId: null,
    openPanel: (mode, nodeId) =>
        set((state) => ({ isOpen: true, mode, selectedNodeId: nodeId || state.selectedNodeId })),
    closePanel: () => set({ isOpen: false }),
    setMode: (mode) => set({ mode }),
}));
