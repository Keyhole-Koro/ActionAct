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

function buildDetailFollowupOptions(userMessage: string, contextNodeIds: string[]): ClarificationCandidateOption[] {
  const isJapanese = /[\u3040-\u30ff\u4e00-\u9fff]/u.test(userMessage);
  const options = isJapanese
    ? [
        ["detail_overview", "まず全体像をつかみたい", "背景と要点を短く整理します。", "全体像と要点"],
        ["detail_focus_points", "論点ごとに深掘りしたい", "重要論点を分けて具体的に見ます。", "主要な論点を深掘り"],
        ["detail_next_actions", "次のアクションを決めたい", "実行順にアクションへ落とし込みます。", "次のアクションを提案"],
      ]
    : [
        ["detail_overview", "Get the big picture first", "I will summarize context and key points briefly.", "big picture and key points"],
        ["detail_focus_points", "Drill into key points", "I will break this down by major focus points.", "deep dive into key points"],
        ["detail_next_actions", "Decide next actions", "I will convert this into ordered, actionable next steps.", "propose next actions"],
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
      const baseMessage = "この質問は画面上のノード文脈が必要です。ノードを選んでから試すか、そのまま文脈なしで続けてください。";
      const md = buildClarificationMessageMd({
        userMessage,
        message: baseMessage,
      });
      return clarification(
        "TRANSPORT_UNAVAILABLE",
        baseMessage,
        "select_node",
        undefined,
        {
          message_md: md.messageMd,
          followup_prompt: md.followupPrompt,
        },
      );
    }
    return { status: "ready", contextNodeIds: [] };
  }

  const tools = await safeListTools(client);
  const toolNames = new Set((tools ?? []).map((tool) => tool.name));
  const hasSelectedNodesTool = toolNames.has("get_selected_nodes");
  const hasActiveNodeTool = toolNames.has("get_active_node_detail");
  const needsIntentSelection = queryNeedsIntentSelection(userMessage);

  if (!hasSelectedNodesTool && !hasActiveNodeTool) {
    if (needsUiContext) {
      const baseMessage = "この質問に必要なノード文脈を今は取得できません。ノードを選んでから再実行するか、文脈なしで続けてください。";
      const md = buildClarificationMessageMd({
        userMessage,
        message: baseMessage,
      });
      return clarification(
        "REQUIRED_TOOL_UNAVAILABLE",
        baseMessage,
        "select_node",
        undefined,
        {
          message_md: md.messageMd,
          followup_prompt: md.followupPrompt,
        },
      );
    }
    return { status: "ready", contextNodeIds: [] };
  }

  // Deterministic fast path: if the user has already selected concrete nodes,
  // trust that explicit UI context instead of asking the decision model again.
  if (hasSelectedNodesTool) {
    const selectedNodeIds = await safeSelectedNodeIds(client);
    if (selectedNodeIds && selectedNodeIds.length > 0) {
      if (needsIntentSelection) {
        const baseMessage = "何を知りたいですか？近いものを選んでください。";
        const candidateOptions = buildIntentSelectionOptions(userMessage, selectedNodeIds);
        const md = buildClarificationMessageMd({
          userMessage,
          message: baseMessage,
          selectedNodeCount: selectedNodeIds.length,
          candidateOptions,
          followupMode: "intent",
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
      return { status: "ready", contextNodeIds: selectedNodeIds };
    }
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
        const detailContextNodeIds = normalizeNodeIds([
          ...visibleGraph.selectedNodeIds,
          ...(visibleGraph.activeNodeId ? [visibleGraph.activeNodeId] : []),
        ]);
        const isRetryWithoutContext = decision.suggested_action === "retry_without_context";
        const detailOptions = isRetryWithoutContext
          ? buildDetailFollowupOptions(userMessage, detailContextNodeIds)
          : undefined;
        const md = buildClarificationMessageMd({
          userMessage,
          message: baseMessage,
          visibleNodeCount: visibleGraph.nodes.length,
          selectedNodeCount: visibleGraph.selectedNodeIds.length,
          activeNodeId: visibleGraph.activeNodeId,
          candidateOptions: detailOptions,
          followupMode: isRetryWithoutContext ? "detail" : "node",
        });
        return clarification(
          "MISSING_UI_CONTEXT",
          baseMessage,
          isRetryWithoutContext ? "retry_without_context" : "select_node",
          detailOptions,
          {
            message_md: md.messageMd,
            followup_prompt: md.followupPrompt,
          },
        );
      }
    } catch {
      // Fall through to local heuristic path.
    }
  }

  if (needsUiContext && hasActiveNodeTool) {
    const activeNodeId = await safeActiveNodeId(client);
    if (activeNodeId) {
      if (needsIntentSelection) {
        const baseMessage = "何を知りたいですか？近いものを選んでください。";
        const candidateOptions = buildIntentSelectionOptions(userMessage, [activeNodeId]);
        const md = buildClarificationMessageMd({
          userMessage,
          message: baseMessage,
          selectedNodeCount: 1,
          activeNodeId,
          candidateOptions,
          followupMode: "intent",
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
      return { status: "ready", contextNodeIds: [activeNodeId] };
    }
  }

  if (needsUiContext) {
    const baseMessage = "どのノードを見ればよいか分かるように、対象のノードを選んでからもう一度実行してください。";
    const md = buildClarificationMessageMd({
      userMessage,
      message: baseMessage,
      followupMode: "node",
    });
    return clarification(
      "MISSING_UI_CONTEXT",
      baseMessage,
      "select_node",
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
