import { create } from 'zustand';

interface RunContextState {
  workspaceId: string;
  topicId: string;
  setWorkspaceId: (workspaceId: string) => void;
  setTopicId: (topicId: string) => void;
  setContext: (workspaceId: string, topicId: string) => void;
}

export const useRunContextStore = create<RunContextState>((set) => ({
  workspaceId: '',
  topicId: '',
  setWorkspaceId: (workspaceId) => set({ workspaceId }),
  setTopicId: (topicId) => set({ topicId }),
  setContext: (workspaceId, topicId) => set({ workspaceId, topicId }),
}));
