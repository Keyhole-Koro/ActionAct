"use client";

import { config } from "@/lib/config";
import { getFirebaseIdToken } from "@/services/firebase/token";

export type VisibleGraphDecisionNode = {
  node_id: string;
  title: string;
  content_md?: string | null;
  selected?: boolean;
  source?: string | null;
};

export type ActDecisionCandidate = {
  node_id: string;
  label: string;
  reason?: string | null;
};

export type ActDecision = {
  action: "run" | "clarify" | "choose_candidate";
  message?: string | null;
  suggested_action?: "select_node" | "retry_without_context" | "none" | null;
  context_node_ids?: string[];
  candidates?: ActDecisionCandidate[];
};

async function getAuthHeader(): Promise<string> {
  const idToken = await getFirebaseIdToken();
  if (!idToken) {
    throw new Error("authentication required");
  }
  return `Bearer ${idToken}`;
}

export async function decideActAction(params: {
  workspaceId: string;
  topicId: string;
  userMessage: string;
  nodes: VisibleGraphDecisionNode[];
  activeNodeId?: string | null;
  selectedNodeIds?: string[];
  availableTools?: string[];
}): Promise<ActDecision> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${config.actApiBaseUrl}/api/decide-act-action`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      workspace_id: params.workspaceId,
      topic_id: params.topicId,
      user_message: params.userMessage,
      active_node_id: params.activeNodeId ?? null,
      selected_node_ids: params.selectedNodeIds ?? [],
      available_tools: params.availableTools ?? [],
      nodes: params.nodes,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "failed to decide act action");
  }

  return await response.json() as ActDecision;
}
