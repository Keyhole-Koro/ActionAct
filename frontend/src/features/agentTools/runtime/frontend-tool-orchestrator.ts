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
  message_md?: string;
  followup_prompt?: string;
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

function compactForMarkdown(value: string, maxLength = 140) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function escapeMarkdownText(value: string) {
  return value.replace(/[\\`*_{}[\]()#+\-.!|>]/g, "\\$&");
}

type ClarificationFollowupMode = "node" | "intent" | "detail";

function buildClarificationMessageMd(params: {
  userMessage: string;
  message: string;
  selectedNodeCount?: number;
  visibleNodeCount?: number;
  activeNodeId?: string | null;
  candidateOptions?: ClarificationCandidateOption[];
  followupMode?: ClarificationFollowupMode;
}) {
  const isJapanese = /[\u3040-\u30ff\u4e00-\u9fff]/u.test(params.userMessage);
  const followupMode = params.followupMode ?? "detail";
  const followupPrompt = isJapanese
    ? followupMode === "intent"
      ? "次に、候補から知りたい観点を1つ選んでください。候補外なら、どの観点で見たいかを1文で指定してください。"
      : followupMode === "node"
        ? "次に、対象ノードを1つ選んでください。候補外なら、ノード名を1文で指定してください。"
        : "次に、対象ノード名または知りたい観点を1文で教えてください。"
    : followupMode === "intent"
      ? "Next, choose one focus area from the options. If none fit, tell me the angle you want in one sentence."
      : followupMode === "node"
        ? "Next, choose one target node. If none match, tell me the node name in one sentence."
        : "Next, tell me either the target node or the angle you want in one sentence.";
  const knownLabel = isJapanese ? "いま分かっていること" : "What we know now";
  const followupLabel = isJapanese ? "Follow-up" : "Follow-up";
  const userLabel = isJapanese ? "依頼" : "Request";
  const visibleLabel = isJapanese ? "画面内ノード数" : "Visible nodes";
  const selectedLabel = isJapanese ? "選択中ノード数" : "Selected nodes";
  const activeLabel = isJapanese ? "アクティブノード" : "Active node";
  const candidateLabel = isJapanese ? "候補" : "Candidates";

  const facts: string[] = [
    `- ${userLabel}: ${escapeMarkdownText(compactForMarkdown(params.userMessage, 120))}`,
  ];
  if (typeof params.visibleNodeCount === "number") {
    facts.push(`- ${visibleLabel}: ${params.visibleNodeCount}`);
  }
  if (typeof params.selectedNodeCount === "number") {
    facts.push(`- ${selectedLabel}: ${params.selectedNodeCount}`);
  }
  if (params.activeNodeId) {
    facts.push(`- ${activeLabel}: ${escapeMarkdownText(params.activeNodeId)}`);
  }

  const candidateLines = (params.candidateOptions ?? []).slice(0, 4).map((candidate) => {
    const reason = candidate.reason && candidate.reason.trim() !== ""
      ? ` - ${escapeMarkdownText(candidate.reason)}`
      : "";
    return `- ${escapeMarkdownText(candidate.label)}${reason}`;
  });

  const lines: string[] = [
    params.message,
    "",
    `### ${knownLabel}`,
    ...facts,
  ];

  if (candidateLines.length > 0) {
    lines.push("", `### ${candidateLabel}`, ...candidateLines);
  }

  lines.push("", `### ${followupLabel}`, followupPrompt);
  return { messageMd: lines.join("\n"), followupPrompt };
}

function clarification(
  code: ActRunClarificationCode,
  message: string,
  suggested_action: ActRunClarification["suggested_action"],
  candidate_options?: ActRunClarification["candidate_options"],
  extra?: {
    message_md?: string;
    followup_prompt?: string;
  },
): ClarificationResult {
  return {
    status: "clarification",
    clarification: {
      code,
      message,
      message_md: extra?.message_md,
      followup_prompt: extra?.followup_prompt,
      suggested_action,
      candidate_options,
    },
  };
}

async function listToolNames(client: FrontendToolClient): Promise<Set<string>> {
  const tools = await client.listTools();
  return new Set(tools.map((tool) => tool.name));
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

async function getVisibleGraph(client: FrontendToolClient): Promise<{
  nodes: VisibleDecisionNode[];
  selectedNodeIds: string[];
  activeNodeId: string | null;
}> {
  const result = await client.invokeTool("get_visible_graph", {
    include_content: false,
    selected_only: false,
  });
  if (!result.ok) {
    throw new Error("get_visible_graph failed");
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

  const available = await client.available();
  if (!available) {
    return { status: "ready", contextNodeIds: [] };
  }

  const toolNames = await listToolNames(client);
  if (!toolNames.has("get_visible_graph")) {
    return { status: "ready", contextNodeIds: [] };
  }

  const visibleGraph = await getVisibleGraph(client);
  if (visibleGraph.nodes.length === 0) {
    return { status: "ready", contextNodeIds: [] };
  }
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

    const baseMessage = typeof decision.message === "string" && decision.message.trim() !== ""
      ? decision.message
      : "どのノードを見ればよいか選んでください。";
    const md = buildClarificationMessageMd({
      userMessage,
      message: baseMessage,
      candidateOptions,
      visibleNodeCount: visibleGraph.nodes.length,
      selectedNodeCount: visibleGraph.selectedNodeIds.length,
      activeNodeId: visibleGraph.activeNodeId,
      followupMode: "node",
    });

    return clarification(
      "MISSING_UI_CONTEXT",
      baseMessage,
      "select_node",
      candidateOptions,
      {
        message_md: md.messageMd,
        followup_prompt: md.followupPrompt,
      },
    );
  }

  if (decision.action === "clarify") {
    const baseMessage = typeof decision.message === "string" && decision.message.trim() !== ""
      ? decision.message
      : "どのノードを見ればよいか分かるように、対象のノードを選んでからもう一度実行してください。";
    const isRetryWithoutContext = decision.suggested_action === "retry_without_context";
    const md = buildClarificationMessageMd({
      userMessage,
      message: baseMessage,
      visibleNodeCount: visibleGraph.nodes.length,
      selectedNodeCount: visibleGraph.selectedNodeIds.length,
      activeNodeId: visibleGraph.activeNodeId,
      followupMode: isRetryWithoutContext ? "detail" : "node",
    });
    return clarification(
      "MISSING_UI_CONTEXT",
      baseMessage,
      isRetryWithoutContext ? "retry_without_context" : "select_node",
      undefined,
      {
        message_md: md.messageMd,
        followup_prompt: md.followupPrompt,
      },
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
