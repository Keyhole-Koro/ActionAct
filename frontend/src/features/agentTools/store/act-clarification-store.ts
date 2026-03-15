"use client";

import { create } from "zustand";

import type { StreamActOptions } from "@/services/act/port";
import { frontendToolServer } from "@/features/agentTools/runtime/frontend-tool-registry";
import { prepareAnchoredActRun, prepareSubmitAskRun, type ActRunClarification } from "@/features/agentTools/runtime/frontend-tool-orchestrator";
import { startActRun } from "@/features/agentTools/runtime/act-runner";
import { useGraphStore } from "@/features/graph/store";

type PendingActRun = {
  targetNodeId: string | null;
  query: string;
  options?: StreamActOptions & { clear?: boolean };
};

type ActClarificationState = {
  clarification: ActRunClarification | null;
  pendingRun: PendingActRun | null;
  setPendingClarification: (payload: { clarification: ActRunClarification; pendingRun: PendingActRun }) => void;
  clearClarification: () => void;
  continueWithoutContext: () => void;
  retryWithSelection: () => Promise<void>;
};

const frontendToolClient = {
  available: () => true,
  listTools: () => frontendToolServer.listTools(),
  invokeTool: (name: string, input: unknown) => frontendToolServer.invokeTool(name, input),
};

export const useActClarificationStore = create<ActClarificationState>((set, get) => ({
  clarification: null,
  pendingRun: null,
  setPendingClarification: ({ clarification, pendingRun }) => set({ clarification, pendingRun }),
  clearClarification: () => set({ clarification: null, pendingRun: null }),
  continueWithoutContext: () => {
    const pendingRun = get().pendingRun;
    if (!pendingRun || useGraphStore.getState().isStreaming) {
      return;
    }
    set({ clarification: null, pendingRun: null });
    startActRun({
      targetNodeId: pendingRun.targetNodeId,
      query: pendingRun.query,
      options: {
        ...pendingRun.options,
        contextNodeIds: [],
      },
    });
  },
  retryWithSelection: async () => {
    const pendingRun = get().pendingRun;
    if (!pendingRun || useGraphStore.getState().isStreaming) {
      return;
    }

    const selectedNodeIds = useGraphStore.getState().selectedNodeIds;
    const explicitContextNodeIds = [...selectedNodeIds];
    const prepared = pendingRun.targetNodeId
      ? await prepareAnchoredActRun(frontendToolClient, {
          anchorNodeId: pendingRun.targetNodeId,
          userMessage: pendingRun.query,
          explicitContextNodeIds,
        })
      : await prepareSubmitAskRun(frontendToolClient, {
          userMessage: pendingRun.query,
          explicitContextNodeIds,
        });

    if (prepared.status !== "ready") {
      set({ clarification: prepared.clarification });
      return;
    }

    set({ clarification: null, pendingRun: null });
    startActRun({
      targetNodeId: pendingRun.targetNodeId,
      query: pendingRun.query,
      options: {
        ...pendingRun.options,
        contextNodeIds: prepared.contextNodeIds,
      },
    });
  },
}));
