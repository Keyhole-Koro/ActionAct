"use client";

import { useRunContextStore } from "@/features/context/store/run-context-store";
import { resolveNodeCandidates } from "@/features/agentTools/services/node-candidate-service";
import type { FrontendToolClient } from "@/features/agentTools/runtime/frontend-tool-client";

type TitledNodeCandidate = {
  nodeId: string;
  title: string;
};

type ScoredNodeCandidate = TitledNodeCandidate & {
  score: number;
  reason: string;
};

type CreateSelectionGroupParams = {
  instruction: string;
  query: string;
  maxCandidates?: number;
};

type DirectCandidate = {
  option_id: string;
  label: string;
  reason?: string | null;
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
  candidate: TitledNodeCandidate,
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

function buildCandidateReason(
  candidate: TitledNodeCandidate,
  queryTokens: string[],
  activeNodeId: string | null,
  selectedNodeIds: string[],
): string {
  const lowerTitle = candidate.title.toLowerCase();
  if (candidate.nodeId === activeNodeId) {
    return "現在見ているノードに近い候補です。";
  }
  if (selectedNodeIds.includes(candidate.nodeId)) {
    return "選択中のノードとして参照されています。";
  }
  const matchedToken = queryTokens.find((token) => lowerTitle.includes(token));
  if (matchedToken) {
    return `「${matchedToken}」に近いタイトルです。`;
  }
  return "画面内で近い候補として見つかりました。";
}

function chooseSelectionGroupCopy(query: string, instruction: string) {
  if (isLikelyJapanese(query)) {
    return {
      title: "どのノードのことですか？",
      instruction: `${instruction} 近いものを選んでください。`.trim(),
    };
  }
  return {
    title: "Which node did you mean?",
    instruction: `${instruction} Pick the closest one.`.trim(),
  };
}

async function createSelectionGroup(
  client: FrontendToolClient,
  params: {
    instruction: string;
    query: string;
    activeNodeId: string | null;
    candidates: Array<{ option_id: string; label: string; reason?: string | null }>;
  },
): Promise<string | null> {
  if (params.candidates.length < 2) {
    return null;
  }

  const copy = chooseSelectionGroupCopy(params.query, params.instruction);
  const created = await client.invokeTool("create_selectable_nodes", {
    title: copy.title,
    instruction: copy.instruction,
    selection_mode: "single",
    anchor_node_id: params.activeNodeId,
    expires_in_ms: 120000,
    options: params.candidates.map((candidate) => ({
      option_id: candidate.option_id,
      label: candidate.label,
      reason: candidate.reason ?? null,
      content_md: null,
      metadata: { node_id: candidate.option_id, kind: "clarification_candidate" },
    })),
  });
  if (!created.ok) {
    return null;
  }

  const createdOutput = created.output as Record<string, unknown>;
  return typeof createdOutput.selection_group_id === "string" ? createdOutput.selection_group_id : null;
}

function extractVisibleCandidates(output: Record<string, unknown>) {
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
    .filter((node): node is TitledNodeCandidate => node !== null);

  return { titledNodeIds, selectedNodeIds, activeNodeId };
}

function extractVisibleGraphNodes(output: Record<string, unknown>) {
  const nodes = Array.isArray(output.nodes) ? output.nodes : [];
  return nodes
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
      return {
        node_id: nodeId,
        title,
        content_md: typeof value.content_md === "string" ? value.content_md : null,
        selected: value.selected === true,
        source: typeof value.source === "string" ? value.source : null,
      };
    })
    .filter((
      node,
    ): node is {
      node_id: string;
      title: string;
      content_md: string | null;
      selected: boolean;
      source: string | null;
    } => node !== null);
}

function rankCandidates(
  candidates: TitledNodeCandidate[],
  query: string,
  activeNodeId: string | null,
  selectedNodeIds: string[],
  maxCandidates: number,
): ScoredNodeCandidate[] {
  const queryTokens = tokenizeQuery(query);
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, queryTokens, activeNodeId, selectedNodeIds),
      reason: buildCandidateReason(candidate, queryTokens, activeNodeId, selectedNodeIds),
    }))
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, maxCandidates);
}

export async function createClarificationSelectionGroup(
  client: FrontendToolClient,
  params: CreateSelectionGroupParams,
): Promise<string | null> {
  const visibleGraph = await client.invokeTool("get_visible_graph", {
    include_content: false,
    selected_only: false,
  });
  if (!visibleGraph.ok) {
    return null;
  }

  const output = visibleGraph.output as Record<string, unknown>;
  const visibleGraphNodes = extractVisibleGraphNodes(output);
  const { titledNodeIds, selectedNodeIds, activeNodeId } = extractVisibleCandidates(output);
  let candidates: ScoredNodeCandidate[] = [];

  try {
    const runContext = useRunContextStore.getState();
    const resolved = await resolveNodeCandidates({
      workspaceId: runContext.workspaceId,
      topicId: runContext.topicId,
      userMessage: params.query,
      nodes: visibleGraphNodes,
      activeNodeId,
      selectedNodeIds,
      maxCandidates: params.maxCandidates ?? 4,
    });

    const byId = new Map(
      titledNodeIds.map((node) => [node.nodeId, node]),
    );
    candidates = resolved
      .map((candidate) => {
        const matched = byId.get(candidate.node_id);
        if (!matched) {
          return null;
        }
        return {
          ...matched,
          score: 1000,
          reason: typeof candidate.reason === "string" && candidate.reason.trim()
            ? candidate.reason.trim()
            : buildCandidateReason(matched, tokenizeQuery(params.query), activeNodeId, selectedNodeIds),
        };
      })
      .filter((candidate): candidate is ScoredNodeCandidate => candidate !== null);
  } catch {
    candidates = rankCandidates(
      titledNodeIds,
      params.query,
      activeNodeId,
      selectedNodeIds,
      params.maxCandidates ?? 4,
    );
  }

  return createSelectionGroup(client, {
    instruction: params.instruction,
    query: params.query,
    activeNodeId,
    candidates: candidates.map((candidate) => ({
      option_id: candidate.nodeId,
      label: candidate.title,
      reason: candidate.reason,
    })),
  });
}

export async function createClarificationSelectionGroupFromCandidates(
  client: FrontendToolClient,
  params: {
    instruction: string;
    query: string;
    candidates: DirectCandidate[];
    activeNodeId?: string | null;
  },
): Promise<string | null> {
  return createSelectionGroup(client, {
    instruction: params.instruction,
    query: params.query,
    activeNodeId: params.activeNodeId ?? null,
    candidates: params.candidates.map((candidate) => ({
      option_id: candidate.option_id,
      label: candidate.label,
      reason: candidate.reason ?? null,
    })),
  });
}
