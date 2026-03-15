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
  node_id: string;
  label: string;
  reason?: string | null;
};

type ParsedVisibleDecisionNode = {
  node_id: string;
  title: string;
  content_md: string | null;
  selected: boolean;
  source: string | null;
};

type ParsedClarificationCandidateOption = {
  node_id: string;
  label: string;
  reason: string | null;
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
  if (typeof value.node_id !== "string" || typeof value.label !== "string") {
    return null;
  }
  return {
    node_id: value.node_id,
    label: value.label,
    reason: typeof value.reason === "string" ? value.reason : null,
  };
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
      return { status: "ready", contextNodeIds: selectedNodeIds };
    }
  }

  if (needsUiContext && hasActiveNodeTool) {
    const activeNodeId = await safeActiveNodeId(client);
    if (activeNodeId) {
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
