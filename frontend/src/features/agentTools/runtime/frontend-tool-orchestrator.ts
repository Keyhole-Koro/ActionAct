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

type ParsedVisibleDecisionNode = {
  node_id: string;
  title: string;
  content_md: string | null;
  selected: boolean;
  source: string | null;
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
  candidate_options?: Array<{
    option_id: string;
    label: string;
    reason?: string | null;
    kind: "node" | "intent";
    node_id?: string;
    query_hint?: string | null;
    context_node_ids?: string[];
  }>;
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
  if (!runContext.workspaceId) {
    return { status: "ready", contextNodeIds: [] };
  }

  let decision;
  try {
    decision = await decideActAction({
      workspaceId: runContext.workspaceId,
      topicId: '',
      userMessage,
      nodes: visibleGraph.nodes,
      activeNodeId: visibleGraph.activeNodeId,
      selectedNodeIds: visibleGraph.selectedNodeIds,
      availableTools: [...toolNames],
    });
  } catch (err) {
    console.warn("[ACT] decideActAction failed, proceeding without context decision:", err);
    return { status: "ready", contextNodeIds: [] };
  }

  if (decision.action === "run") {
    return {
      status: "ready",
      contextNodeIds: normalizeNodeIds(Array.isArray(decision.context_node_ids) ? decision.context_node_ids : []),
    };
  }

  if (decision.action === "choose_candidate") {
    return {
      status: "ready",
      contextNodeIds: normalizeNodeIds(Array.isArray(decision.context_node_ids) ? decision.context_node_ids : []),
    };
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
