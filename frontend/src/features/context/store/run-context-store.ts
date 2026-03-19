import { create } from 'zustand';

interface RunContextState {
  workspaceId: string;
  topicId: string;
  isReadOnly: boolean;
  setWorkspaceId: (workspaceId: string) => void;
  setContext: (workspaceId: string, topicId: string) => void;
  setReadOnly: (isReadOnly: boolean) => void;
}

export const useRunContextStore = create<RunContextState>((set) => ({
  workspaceId: '',
  topicId: '',
  isReadOnly: false,
  setWorkspaceId: (workspaceId) => set({ workspaceId }),
  setContext: (workspaceId, topicId) => set({ workspaceId, topicId }),
  setReadOnly: (isReadOnly) => set({ isReadOnly }),
}));
