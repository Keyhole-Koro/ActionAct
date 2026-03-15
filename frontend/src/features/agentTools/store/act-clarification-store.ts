"use client";

import { create } from "zustand";

import type { StreamActOptions } from "@/services/act/port";
import { useAgentInteractionStore } from "@/features/agentInteraction/store/interactionStore";
import { prepareAnchoredActRun, prepareSubmitAskRun, type ActRunClarification } from "@/features/agentTools/runtime/frontend-tool-orchestrator";
import { startActRun } from "@/features/agentTools/runtime/act-runner";
import { createClarificationSelectionGroup } from "@/features/agentTools/runtime/browser-candidate-agent";
import { createDirectFrontendToolClient } from "@/features/agentTools/runtime/frontend-tool-client";
import { useGraphStore } from "@/features/graph/store";

type PendingActRun = {
  targetNodeId: string | null;
  query: string;
  options?: StreamActOptions & { clear?: boolean };
  selectionGroupId?: string | null;
};

type ActClarificationState = {
  clarification: ActRunClarification | null;
  pendingRun: PendingActRun | null;
  setPendingClarification: (payload: { clarification: ActRunClarification; pendingRun: PendingActRun }) => Promise<void>;
  clearClarification: () => void;
  continueWithoutContext: () => void;
  retryWithSelection: () => Promise<void>;
};

const frontendToolClient = createDirectFrontendToolClient();

function uniqueNodeIds(nodeIds: string[]) {
  const seen = new Set<string>();
  const ordered: string[] = [];
  nodeIds.forEach((nodeId) => {
    const normalized = nodeId.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    ordered.push(normalized);
  });
  return ordered;
}

export const useActClarificationStore = create<ActClarificationState>((set, get) => ({
  clarification: null,
  pendingRun: null,
  setPendingClarification: async ({ clarification, pendingRun }) => {
    const previousGroupId = get().pendingRun?.selectionGroupId;
    if (previousGroupId) {
      useAgentInteractionStore.getState().cancelGroup(previousGroupId);
    }
    const selectionGroupId = clarification.suggested_action === "select_node"
      ? await createClarificationSelectionGroup(frontendToolClient, {
          instruction: clarification.message,
          query: pendingRun.query,
        })
      : null;
    set({
      clarification,
      pendingRun: {
        ...pendingRun,
        selectionGroupId,
      },
    });
  },
  clearClarification: () => {
    const previousGroupId = get().pendingRun?.selectionGroupId;
    if (previousGroupId) {
      useAgentInteractionStore.getState().cancelGroup(previousGroupId);
    }
    set({ clarification: null, pendingRun: null });
  },
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

    let selectedNodeIds = [...useGraphStore.getState().selectedNodeIds];
    if (selectedNodeIds.length === 0 && pendingRun.selectionGroupId) {
      const result = await frontendToolClient.invokeTool("get_selection_group_result", {
        selection_group_id: pendingRun.selectionGroupId,
        wait_for_user: false,
      });
      if (result.ok) {
        const output = result.output as Record<string, unknown>;
        const selectedOptionIds = Array.isArray(output.selected_option_ids)
          ? output.selected_option_ids.filter((value): value is string => typeof value === "string")
          : [];
        selectedNodeIds = uniqueNodeIds(selectedOptionIds);
        if (selectedNodeIds.length > 0) {
          useGraphStore.getState().setSelectedNodes(selectedNodeIds);
        }
      }
    }

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

    if (pendingRun.selectionGroupId) {
      useAgentInteractionStore.getState().cancelGroup(pendingRun.selectionGroupId);
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
