"use client";

import { create } from "zustand";

import type { StreamActOptions } from "@/services/act/port";
import { useAgentInteractionStore } from "@/features/agentInteraction/store/interactionStore";
import { prepareAnchoredActRun, prepareSubmitAskRun, type ActRunClarification } from "@/features/agentTools/runtime/frontend-tool-orchestrator";
import { startActRun } from "@/features/agentTools/runtime/act-runner";
import {
  createClarificationSelectionGroup,
  createClarificationSelectionGroupFromCandidates,
} from "@/features/agentTools/runtime/browser-candidate-agent";
import { createDirectFrontendToolClient } from "@/features/agentTools/runtime/frontend-tool-client";
import { useGraphStore } from "@/features/graph/store";

type PendingActRun = {
  targetNodeId: string | null;
  query: string;
  options?: StreamActOptions & { clear?: boolean };
  selectionGroupId?: string | null;
  selectionOptions?: ActRunClarification["candidate_options"];
};

type ActClarificationState = {
  clarification: ActRunClarification | null;
  pendingRun: PendingActRun | null;
  setPendingClarification: (payload: { clarification: ActRunClarification; pendingRun: PendingActRun }) => Promise<void>;
  waitForSelectionAndRetry: (selectionGroupId: string) => Promise<void>;
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

function isLikelyJapanese(text: string) {
  return /[\u3040-\u30ff\u4e00-\u9fff]/u.test(text);
}

export const useActClarificationStore = create<ActClarificationState>((set, get) => ({
  clarification: null,
  pendingRun: null,
  waitForSelectionAndRetry: async (selectionGroupId) => {
    const pendingRun = get().pendingRun;
    if (!pendingRun || pendingRun.selectionGroupId !== selectionGroupId || useGraphStore.getState().isStreaming) {
      return;
    }

    const result = await frontendToolClient.invokeTool("get_selection_group_result", {
      selection_group_id: selectionGroupId,
      wait_for_user: true,
      timeout_ms: 120000,
    });
    if (!result.ok) {
      return;
    }

    const output = result.output as Record<string, unknown>;
    const status = typeof output.status === "string" ? output.status : "pending";
    if (status !== "selected") {
      return;
    }

    const latestPending = get().pendingRun;
    if (!latestPending || latestPending.selectionGroupId !== selectionGroupId || useGraphStore.getState().isStreaming) {
      return;
    }

    await get().retryWithSelection();
  },
  setPendingClarification: async ({ clarification, pendingRun }) => {
    const previousGroupId = get().pendingRun?.selectionGroupId;
    if (previousGroupId) {
      useAgentInteractionStore.getState().cancelGroup(previousGroupId);
    }
    const selectionGroupId = clarification.suggested_action === "select_node"
      ? (
        Array.isArray(clarification.candidate_options) && clarification.candidate_options.length >= 2
          ? await createClarificationSelectionGroupFromCandidates(frontendToolClient, {
              instruction: clarification.message,
              query: pendingRun.query,
              candidates: clarification.candidate_options,
            })
          : await createClarificationSelectionGroup(frontendToolClient, {
              instruction: clarification.message,
              query: pendingRun.query,
            })
      )
      : null;
    set({
      clarification,
      pendingRun: {
        ...pendingRun,
        selectionGroupId,
        selectionOptions: clarification.candidate_options,
      },
    });

    if (selectionGroupId) {
      void get().waitForSelectionAndRetry(selectionGroupId);
    }
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
        const selectedOption = pendingRun.selectionOptions?.find((option) => selectedOptionIds.includes(option.option_id));
        if (selectedOption?.kind === "node") {
          selectedNodeIds = uniqueNodeIds([selectedOption.node_id ?? selectedOption.option_id]);
          if (selectedNodeIds.length > 0) {
            useGraphStore.getState().setSelectedNodes(selectedNodeIds);
          }
        } else if (selectedOption?.kind === "intent") {
          const nextQuery = selectedOption.query_hint
            ? `${pendingRun.query}\n\n${isLikelyJapanese(pendingRun.query) ? "知りたいこと" : "What to focus on"}: ${selectedOption.query_hint}`
            : pendingRun.query;
          const explicitContextNodeIds = uniqueNodeIds(selectedOption.context_node_ids ?? []);
          const prepared = pendingRun.targetNodeId
            ? await prepareAnchoredActRun(frontendToolClient, {
                anchorNodeId: pendingRun.targetNodeId,
                userMessage: nextQuery,
                explicitContextNodeIds,
              })
            : await prepareSubmitAskRun(frontendToolClient, {
                userMessage: nextQuery,
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
            query: nextQuery,
            options: {
              ...pendingRun.options,
              contextNodeIds: prepared.contextNodeIds,
            },
          });
          return;
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
