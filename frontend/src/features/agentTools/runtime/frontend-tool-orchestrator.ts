"use client";

import type { frontendToolServer } from "@/features/agentTools/runtime/frontend-tool-registry";

type ToolInvokeResult = Awaited<ReturnType<typeof frontendToolServer.invokeTool>>;
type ToolDescriptor = ReturnType<typeof frontendToolServer.listTools>[number];

type FrontendToolClient = {
  available: () => Promise<boolean> | boolean;
  listTools: () => Promise<ToolDescriptor[]> | ToolDescriptor[];
  invokeTool: (name: string, input: unknown) => Promise<ToolInvokeResult> | ToolInvokeResult;
};

export type ActRunClarificationCode =
  | "TRANSPORT_UNAVAILABLE"
  | "MISSING_UI_CONTEXT"
  | "REQUIRED_TOOL_UNAVAILABLE";

export type ActRunClarification = {
  code: ActRunClarificationCode;
  message: string;
  suggested_action: "select_node" | "retry_without_context" | "none";
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
): ClarificationResult {
  return {
    status: "clarification",
    clarification: { code, message, suggested_action },
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
        "UI context is needed but frontend tool transport is unavailable",
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
        "UI context tools are unavailable in the current frontend tool server",
        "select_node",
      );
    }
    return { status: "ready", contextNodeIds: [] };
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
      "No selected or active node is available for the requested UI-context-dependent act run",
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
