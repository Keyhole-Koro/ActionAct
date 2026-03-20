"use client";

import { config } from "@/lib/config";
import { getCSRFToken } from "@/services/firebase/csrf";
import { getFirebaseIdToken } from "@/services/firebase/token";

export type VisibleGraphCandidateNode = {
  node_id: string;
  title: string;
  content_md?: string | null;
  selected?: boolean;
  source?: string | null;
};

export type ResolvedNodeCandidate = {
  node_id: string;
  label: string;
  reason?: string | null;
};

type ResolveNodeCandidatesResponse = {
  candidates?: ResolvedNodeCandidate[];
};

async function getAuthHeader(): Promise<string> {
  const idToken = await getFirebaseIdToken();
  if (!idToken) {
    throw new Error("authentication required");
  }
  return `Bearer ${idToken}`;
}

export async function resolveNodeCandidates(params: {
  workspaceId: string;
  topicId: string;
  userMessage: string;
  nodes: VisibleGraphCandidateNode[];
  activeNodeId?: string | null;
  selectedNodeIds?: string[];
  maxCandidates?: number;
}): Promise<ResolvedNodeCandidate[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${config.actApiBaseUrl}/api/resolve-node-candidates`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      "X-CSRF-Token": getCSRFToken(),
    },
    credentials: "include",
    body: JSON.stringify({
      workspace_id: params.workspaceId,
      topic_id: params.topicId,
      user_message: params.userMessage,
      active_node_id: params.activeNodeId ?? null,
      selected_node_ids: params.selectedNodeIds ?? [],
      max_candidates: params.maxCandidates ?? 4,
      nodes: params.nodes,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "failed to resolve node candidates");
  }

  const payload = (await response.json()) as ResolveNodeCandidatesResponse;
  return Array.isArray(payload.candidates) ? payload.candidates : [];
}
