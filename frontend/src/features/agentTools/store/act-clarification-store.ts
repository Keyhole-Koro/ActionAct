"use client";

import { create } from "zustand";

import type { StreamActOptions } from "@/services/act/port";
import { useAgentInteractionStore } from "@/features/agentInteraction/store/interactionStore";
import { frontendToolServer } from "@/features/agentTools/runtime/frontend-tool-registry";
import { prepareAnchoredActRun, prepareSubmitAskRun, type ActRunClarification } from "@/features/agentTools/runtime/frontend-tool-orchestrator";
import { startActRun } from "@/features/agentTools/runtime/act-runner";
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

const frontendToolClient = {
  available: () => true,
  listTools: () => frontendToolServer.listTools(),
  invokeTool: (name: string, input: unknown) => frontendToolServer.invokeTool(name, input),
};

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

function tokenizeQuery(query: string): string[] {
  return uniqueNodeIds(
    query
      .toLowerCase()
      .split(/[\s\u3000、。,.!?()[\]{}:"'`/\\|+-]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
}

function isLikelyJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/u.test(text);
}

function scoreCandidate(
  candidate: { nodeId: string; title: string },
  queryTokens: string[],
  activeNodeId: string | null,
  selectedNodeIds: string[],
): number {
  const lowerTitle = candidate.title.toLowerCase();
  let score = 0;

  if (candidate.nodeId === activeNodeId) {
    score += 100;
  }
  if (selectedNodeIds.includes(candidate.nodeId)) {
    score += 80;
  }

  queryTokens.forEach((token) => {
    if (lowerTitle === token) {
      score += 60;
    } else if (lowerTitle.startsWith(token)) {
      score += 35;
    } else if (lowerTitle.includes(token)) {
      score += 20;
    }
  });

  score += Math.max(0, 24 - candidate.title.length / 2);
  return score;
}

async function createClarificationSelectionGroup(instruction: string, query: string): Promise<string | null> {
  const visibleGraph = await frontendToolServer.invokeTool("get_visible_graph", {
    include_content: false,
    selected_only: false,
  });
  if (!visibleGraph.ok) {
    return null;
  }

  const output = visibleGraph.output as Record<string, unknown>;
  const nodes = Array.isArray(output.nodes) ? output.nodes : [];
  const selectedNodeIds = Array.isArray(output.selected_node_ids)
    ? output.selected_node_ids.filter((value): value is string => typeof value === "string")
    : [];
  const activeNodeId = typeof output.active_node_id === "string" ? output.active_node_id : null;
  const titledNodeIds = nodes
    .map((node) => {
      if (!node || typeof node !== "object") {
        return null;
      }
      const value = node as Record<string, unknown>;
      const nodeId = typeof value.node_id === "string" ? value.node_id : null;
      const title = typeof value.title === "string" ? value.title.trim() : "";
      if (!nodeId || !title || nodeId.startsWith("sg-")) {
        return null;
      }
      return { nodeId, title };
    })
    .filter((node): node is { nodeId: string; title: string } => node !== null);

  const queryTokens = tokenizeQuery(query);
  const candidates = titledNodeIds
    .map((node) => ({
      ...node,
      score: scoreCandidate(node, queryTokens, activeNodeId, selectedNodeIds),
    }))
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, 4);

  if (candidates.length < 2) {
    return null;
  }

  const isJapanese = isLikelyJapanese(query);
  const title = isJapanese ? "どのノードのことですか？" : "Which node did you mean?";
  const nextInstruction = isJapanese
    ? "近いものを選んでください。"
    : "Pick the closest one.";

  const created = await frontendToolServer.invokeTool("create_selectable_nodes", {
    title,
    instruction: `${instruction} ${nextInstruction}`.trim(),
    selection_mode: "single",
    anchor_node_id: activeNodeId,
    expires_in_ms: 120000,
    options: candidates.map((node) => ({
      option_id: node.nodeId,
      label: node.title,
      content_md: null,
      metadata: { node_id: node.nodeId, kind: "clarification_candidate" },
    })),
  });

  if (!created.ok) {
    return null;
  }

  const createdOutput = created.output as Record<string, unknown>;
  return typeof createdOutput.selection_group_id === "string" ? createdOutput.selection_group_id : null;
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
      ? await createClarificationSelectionGroup(clarification.message, pendingRun.query)
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
      const result = await frontendToolServer.invokeTool("get_selection_group_result", {
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
