"use client";

import { decideActAction } from "@/features/agentTools/services/act-decision-service";
import { useRunContextStore } from "@/features/context/store/run-context-store";
import type { frontendToolServer } from "@/features/agentTools/runtime/frontend-tool-registry";

type ToolInvokeResult = Awaited<ReturnType<typeof frontendToolServer.invokeTool>>;
type ToolDescriptor = ReturnType<typeof frontendToolServer.listTools>[number];

type FrontendToolClient = {
  available: () => Promise<boolean> | boolean;
  listTools: () => Promise<ToolDescriptor[]> | ToolDescriptor[];
  invokeTool: (name: string, input: unknown) => Promise<ToolInvokeResult> | ToolInvokeResult;
};

type VisibleDecisionNode = {
  node_id: string;
  title: string;
  content_md?: string | null;
  selected?: boolean;
  source?: string | null;
};

type ClarificationCandidateOption = {
  option_id: string;
  label: string;
  reason?: string | null;
  kind: "node" | "intent";
  node_id?: string;
  query_hint?: string | null;
  context_node_ids?: string[];
};

type ParsedVisibleDecisionNode = {
  node_id: string;
  title: string;
  content_md: string | null;
  selected: boolean;
  source: string | null;
};

type ParsedClarificationCandidateOption = {
  option_id: string;
  label: string;
  reason: string | null;
  kind: "node" | "intent";
  node_id?: string;
  query_hint?: string | null;
  context_node_ids?: string[];
};

export type ActRunClarificationCode =
  | "TRANSPORT_UNAVAILABLE"
  | "MISSING_UI_CONTEXT"
  | "REQUIRED_TOOL_UNAVAILABLE";

export type ActRunClarification = {
  code: ActRunClarificationCode;
  message: string;
  suggested_action: "select_node" | "retry_without_context" | "none";
  candidate_options?: ClarificationCandidateOption[];
};

type ClarificationResult = {
  status: "clarification";
  clarification: ActRunClarification;
};

type ReadyResult = {
  status: "ready";
  contextNodeIds: string[];
};

export type PrepareSubmitAskParams = {
  userMessage: string;
  explicitContextNodeIds?: string[];
};

export type PrepareAnchoredActParams = {
  userMessage: string;
  anchorNodeId: string;
  explicitContextNodeIds?: string[];
};

const UI_CONTEXT_HINT_PATTERN =
  /\b(this|that|these|those|selected|selection|current|active|above|below|here|continue|following)\b|この|その|これ|それ|選択|今の|現在の|上の|下の|ここ|続き/u;
const GENERIC_INTENT_PATTERN =
  /^(これ|このノード|この内容|これについて|この件|これを|詳しく|教えて|知りたい|まとめて|要するに|about this|this node|this one|tell me more|tell me about this|explain this)$/iu;

function normalizeNodeIds(nodeIds: string[]): string[] {
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

function queryNeedsUiContext(userMessage: string) {
  return UI_CONTEXT_HINT_PATTERN.test(userMessage);
}

function queryNeedsIntentSelection(userMessage: string) {
  const normalized = userMessage.trim();
  return normalized.length > 0 && GENERIC_INTENT_PATTERN.test(normalized);
}

function clarification(
  code: ActRunClarificationCode,
  message: string,
  suggested_action: ActRunClarification["suggested_action"],
  candidate_options?: ActRunClarification["candidate_options"],
): ClarificationResult {
  return {
    status: "clarification",
    clarification: { code, message, suggested_action, candidate_options },
  };
}

async function safeListTools(client: FrontendToolClient) {
  try {
    return await client.listTools();
  } catch {
    return null;
  }
}

async function safeSelectedNodeIds(client: FrontendToolClient): Promise<string[] | null> {
  try {
    const result = await client.invokeTool("get_selected_nodes", { include_content: false });
    if (!result.ok) {
      return null;
    }
    const nodes = Array.isArray(result.output.nodes) ? result.output.nodes : [];
    return normalizeNodeIds(
      nodes
        .map((node) => (node && typeof node === "object" ? (node as Record<string, unknown>).node_id : null))
        .filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return null;
  }
}

async function safeActiveNodeId(client: FrontendToolClient): Promise<string | null> {
  try {
    const result = await client.invokeTool("get_active_node_detail", {});
    if (!result.ok) {
      return null;
    }
    return typeof result.output.active_node_id === "string" && result.output.active_node_id.trim() !== ""
      ? result.output.active_node_id
      : null;
  } catch {
    return null;
  }
}

function parseVisibleDecisionNode(node: unknown): ParsedVisibleDecisionNode | null {
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
}

function parseClarificationCandidateOption(candidate: unknown): ParsedClarificationCandidateOption | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const value = candidate as Record<string, unknown>;
  const optionId = typeof value.option_id === "string"
    ? value.option_id
    : typeof value.node_id === "string"
      ? value.node_id
      : null;
  if (!optionId || typeof value.label !== "string") {
    return null;
  }
  return {
    option_id: optionId,
    label: value.label,
    reason: typeof value.reason === "string" ? value.reason : null,
    kind: value.kind === "intent" ? "intent" : "node",
    node_id: typeof value.node_id === "string" ? value.node_id : undefined,
    query_hint: typeof value.query_hint === "string" ? value.query_hint : null,
    context_node_ids: Array.isArray(value.context_node_ids)
      ? value.context_node_ids.filter((entry): entry is string => typeof entry === "string")
      : undefined,
  };
}

function buildIntentSelectionOptions(userMessage: string, contextNodeIds: string[]): ClarificationCandidateOption[] {
  const isJapanese = /[\u3040-\u30ff\u4e00-\u9fff]/u.test(userMessage);
  const options = isJapanese
    ? [
        ["overview", "概要を知りたい", "まず全体像を整理します。", "概要"],
        ["key_points", "重要ポイントを知りたい", "要点だけ短く絞ります。", "重要ポイント"],
        ["examples", "具体例を知りたい", "実例やケースで説明します。", "具体例"],
        ["compare", "他と比較したい", "比較の観点で整理します。", "比較"],
      ]
    : [
        ["overview", "Get an overview", "Start with the big picture.", "overview"],
        ["key_points", "See key points", "Focus on the main takeaways.", "key points"],
        ["examples", "See examples", "Explain it with concrete examples.", "examples"],
        ["compare", "Compare it", "Frame it as a comparison.", "comparison"],
      ];

  return options.map(([optionId, label, reason, queryHint]) => ({
    option_id: optionId,
    label,
    reason,
    kind: "intent" as const,
    query_hint: queryHint,
    context_node_ids: contextNodeIds,
  }));
}

async function safeVisibleGraph(client: FrontendToolClient): Promise<{
  nodes: VisibleDecisionNode[];
  selectedNodeIds: string[];
  activeNodeId: string | null;
} | null> {
  try {
    const result = await client.invokeTool("get_visible_graph", {
      include_content: false,
      selected_only: false,
    });
    if (!result.ok) {
      return null;
    }
    const output = result.output as Record<string, unknown>;
    const nodes = Array.isArray(output.nodes) ? output.nodes : [];
    const selectedNodeIds = Array.isArray(output.selected_node_ids)
      ? output.selected_node_ids.filter((value): value is string => typeof value === "string")
      : [];
    const activeNodeId =
      typeof output.active_node_id === "string" && output.active_node_id.trim() !== ""
        ? output.active_node_id
        : null;

    const visibleNodes = nodes
      .map(parseVisibleDecisionNode)
      .filter((node): node is ParsedVisibleDecisionNode => node !== null);

    return {
      nodes: visibleNodes,
      selectedNodeIds: normalizeNodeIds(selectedNodeIds),
      activeNodeId,
    };
  } catch {
    return null;
  }
}

async function resolveContextNodeIds(
  client: FrontendToolClient,
  userMessage: string,
  explicitContextNodeIds: string[],
): Promise<ReadyResult | ClarificationResult> {
  const explicit = normalizeNodeIds(explicitContextNodeIds);
  if (explicit.length > 0) {
    return { status: "ready", contextNodeIds: explicit };
  }

  const needsUiContext = queryNeedsUiContext(userMessage);
  const available = await client.available();
  if (!available) {
    if (needsUiContext) {
      return clarification(
        "TRANSPORT_UNAVAILABLE",
        "この質問は画面上のノード文脈が必要です。ノードを選んでから試すか、そのまま文脈なしで続けてください。",
        "select_node",
      );
    }
    return { status: "ready", contextNodeIds: [] };
  }

  const tools = await safeListTools(client);
  const toolNames = new Set((tools ?? []).map((tool) => tool.name));
  const hasSelectedNodesTool = toolNames.has("get_selected_nodes");
  const hasActiveNodeTool = toolNames.has("get_active_node_detail");

  if (!hasSelectedNodesTool && !hasActiveNodeTool) {
    if (needsUiContext) {
      return clarification(
        "REQUIRED_TOOL_UNAVAILABLE",
        "この質問に必要なノード文脈を今は取得できません。ノードを選んでから再実行するか、文脈なしで続けてください。",
        "select_node",
      );
    }
    return { status: "ready", contextNodeIds: [] };
  }

  const visibleGraph = await safeVisibleGraph(client);
  if (visibleGraph && visibleGraph.nodes.length > 0) {
    try {
      const runContext = useRunContextStore.getState();
      const decision = await decideActAction({
        workspaceId: runContext.workspaceId,
        topicId: runContext.topicId,
        userMessage,
        nodes: visibleGraph.nodes,
        activeNodeId: visibleGraph.activeNodeId,
        selectedNodeIds: visibleGraph.selectedNodeIds,
        availableTools: [...toolNames],
      });

      if (decision.action === "run") {
        return {
          status: "ready",
          contextNodeIds: normalizeNodeIds(Array.isArray(decision.context_node_ids) ? decision.context_node_ids : []),
        };
      }

      if (decision.action === "choose_candidate") {
        const candidateOptions: ClarificationCandidateOption[] = Array.isArray(decision.candidates)
          ? decision.candidates
              .map(parseClarificationCandidateOption)
              .filter((candidate): candidate is ParsedClarificationCandidateOption => candidate !== null)
              .map((candidate) => ({
                ...candidate,
                kind: "node" as const,
                node_id: candidate.node_id ?? candidate.option_id,
                option_id: candidate.option_id,
              }))
          : [];

        return clarification(
          "MISSING_UI_CONTEXT",
          typeof decision.message === "string" && decision.message.trim() !== ""
            ? decision.message
            : "どのノードを見ればよいか選んでください。",
          "select_node",
          candidateOptions,
        );
      }

      if (decision.action === "clarify") {
        return clarification(
          "MISSING_UI_CONTEXT",
          typeof decision.message === "string" && decision.message.trim() !== ""
            ? decision.message
            : "どのノードを見ればよいか分かるように、対象のノードを選んでからもう一度実行してください。",
          decision.suggested_action === "retry_without_context" ? "retry_without_context" : "select_node",
        );
      }
    } catch {
      // Fall through to local heuristic path.
    }
  }

  if (hasSelectedNodesTool) {
    const selectedNodeIds = await safeSelectedNodeIds(client);
    if (selectedNodeIds && selectedNodeIds.length > 0) {
      if (queryNeedsIntentSelection(userMessage)) {
        return clarification(
          "MISSING_UI_CONTEXT",
          "何を知りたいですか？近いものを選んでください。",
          "select_node",
          buildIntentSelectionOptions(userMessage, selectedNodeIds),
        );
      }
      return { status: "ready", contextNodeIds: selectedNodeIds };
    }
  }

  if (needsUiContext && hasActiveNodeTool) {
    const activeNodeId = await safeActiveNodeId(client);
    if (activeNodeId) {
      if (queryNeedsIntentSelection(userMessage)) {
        return clarification(
          "MISSING_UI_CONTEXT",
          "何を知りたいですか？近いものを選んでください。",
          "select_node",
          buildIntentSelectionOptions(userMessage, [activeNodeId]),
        );
      }
      return { status: "ready", contextNodeIds: [activeNodeId] };
    }
  }

  if (needsUiContext) {
    return clarification(
      "MISSING_UI_CONTEXT",
      "どのノードを見ればよいか分かるように、対象のノードを選んでからもう一度実行してください。",
      "select_node",
    );
  }

  return { status: "ready", contextNodeIds: [] };
}

export async function prepareSubmitAskRun(
  client: FrontendToolClient,
  params: PrepareSubmitAskParams,
): Promise<ReadyResult | ClarificationResult> {
  return resolveContextNodeIds(client, params.userMessage, params.explicitContextNodeIds ?? []);
}

export async function prepareAnchoredActRun(
  client: FrontendToolClient,
  params: PrepareAnchoredActParams,
): Promise<ReadyResult | ClarificationResult> {
  const resolved = await resolveContextNodeIds(client, params.userMessage, params.explicitContextNodeIds ?? []);
  if (resolved.status !== "ready") {
    return resolved;
  }

  return {
    status: "ready",
    contextNodeIds: normalizeNodeIds(resolved.contextNodeIds.filter((nodeId) => nodeId !== params.anchorNodeId)),
  };
}
