"use client";

import type { Node, Edge } from "@xyflow/react";

import type { SelectionMode } from "@/features/agentInteraction/types";
import { useAgentInteractionStore } from "@/features/agentInteraction/store/interactionStore";
import { toSelectionFlow } from "@/features/graph/selectors/toSelectionFlow";
import { mergeTreeWithActNodes, projectPersistedTree } from "@/features/graph/selectors/projectGraph";
import { useGraphStore } from "@/features/graph/store";
import { startActRun } from "@/features/agentTools/runtime/act-runner";
import { prepareAnchoredActRun, prepareSubmitAskRun } from "@/features/agentTools/runtime/frontend-tool-orchestrator";
import { useStreamPreferencesStore } from "@/features/agentTools/store/stream-preferences-store";
import type { GraphNodeBase } from "@/features/graph/types";

type ToolErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE" | "INTERNAL";

type ToolError = {
  code: ToolErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
};

type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  invoke: (input: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
};

function toolError(code: ToolErrorCode, message: string, retryable = false, details?: Record<string, unknown>): ToolError {
  return { code, message, retryable, details };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    throw toolError("INVALID_INPUT", "Tool input must be an object");
  }
  return input;
}

function rejectUnknownKeys(input: Record<string, unknown>, allowedKeys: string[]) {
  const unknownKeys = Object.keys(input).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw toolError("INVALID_INPUT", "Unknown input fields", false, { unknown_keys: unknownKeys });
  }
}

function optionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw toolError("INVALID_INPUT", `${key} must be boolean`);
  }
  return value;
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw toolError("INVALID_INPUT", `${key} must be string`);
  }
  return value;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input, key);
  if (!value || value.trim() === "") {
    throw toolError("INVALID_INPUT", `${key} is required`);
  }
  return value;
}

function optionalStringArray(input: Record<string, unknown>, key: string): string[] | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw toolError("INVALID_INPUT", `${key} must be an array of strings`);
  }
  return value;
}

function requiredStringArray(input: Record<string, unknown>, key: string): string[] {
  return optionalStringArray(input, key) ?? [];
}

function optionalInteger(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw toolError("INVALID_INPUT", `${key} must be an integer`);
  }
  return value;
}

function currentRegularNodes(): Node[] {
  const graphStore = useGraphStore.getState();
  const persistedTree = projectPersistedTree(
    graphStore.persistedNodes as GraphNodeBase[],
    graphStore.persistedEdges,
    graphStore.expandedBranchNodeIds,
  );
  const { mergedTreeNodes, standaloneActNodes } = mergeTreeWithActNodes(
    persistedTree.visibleNodes,
    graphStore.persistedNodes as GraphNodeBase[],
    graphStore.actNodes as GraphNodeBase[],
  );
  return [...mergedTreeNodes, ...standaloneActNodes];
}

function currentVisibleGraph(): { nodes: Node[]; edges: Edge[] } {
  const graphStore = useGraphStore.getState();
  const regularNodes = currentRegularNodes();
  const persistedTree = projectPersistedTree(
    graphStore.persistedNodes as GraphNodeBase[],
    graphStore.persistedEdges,
    graphStore.expandedBranchNodeIds,
  );
  const regularEdges = [...persistedTree.visibleEdges, ...graphStore.actEdges];
  const { nodes: selectionNodes, edges: selectionEdges } = toSelectionFlow(
    useAgentInteractionStore.getState().groups,
    persistedTree.visibleNodes,
  );

  return {
    nodes: [...regularNodes, ...selectionNodes],
    edges: [...regularEdges, ...selectionEdges],
  };
}

function ensureNodesExist(nodeIds: string[]): Node[] {
  const byId = new Map(currentVisibleGraph().nodes.map((node) => [node.id, node]));
  const missing = nodeIds.filter((nodeId) => !byId.has(nodeId));
  if (missing.length > 0) {
    throw toolError("NOT_FOUND", "Some node_ids were not found", false, { missing_node_ids: missing });
  }
  return nodeIds.map((nodeId) => byId.get(nodeId)!);
}

function mapVisibleNode(node: Node, source: "persisted" | "frontend_draft"): Record<string, unknown> {
  const referencedNodeIds = Array.isArray(node.data?.referencedNodeIds)
    ? node.data.referencedNodeIds.filter((value): value is string => typeof value === "string")
    : [];
  const visibleNodes = currentVisibleGraph().nodes;
  return {
    node_id: node.id,
    block_type: typeof node.data?.kind === "string" ? node.data.kind : "unknown",
    title: typeof node.data?.label === "string" ? node.data.label : null,
    content_md: typeof node.data?.contentMd === "string" ? node.data.contentMd : null,
    parent_id: typeof node.data?.parentId === "string" ? node.data.parentId : null,
    referenced_nodes: referencedNodeIds.map((nodeId) => {
      const matched = visibleNodes.find((candidate) => candidate.id === nodeId);
      return {
        node_id: nodeId,
        label: typeof matched?.data?.label === "string" ? matched.data.label : undefined,
      };
    }),
    selected: useGraphStore.getState().selectedNodeIds.includes(node.id),
    source,
    save_state: source === "persisted" ? "persisted" : useGraphStore.getState().isStreaming ? "streaming" : "completed_unsaved",
    x: node.position?.x ?? null,
    y: node.position?.y ?? null,
  };
}

function mapVisibleEdge(edge: Edge): Record<string, unknown> {
  return {
    edge_id: edge.id,
    source_node_id: edge.source,
    target_node_id: edge.target,
    edge_type: edge.id.startsWith("edge-ctx-") ? "context" : "tree",
  };
}

async function waitForSelectionGroup(selectionGroupId: string, timeoutMs?: number | null) {
  const initial = useAgentInteractionStore.getState().groups[selectionGroupId];
  if (!initial) {
    throw toolError("NOT_FOUND", "selection_group_id was not found");
  }
  if (initial.status !== "pending") {
    return;
  }

  await new Promise<void>((resolve) => {
    const unsubscribe = useAgentInteractionStore.subscribe((state) => {
      const group = state.groups[selectionGroupId];
      if (!group || group.status !== "pending") {
        unsubscribe();
        resolve();
      }
    });

    if (timeoutMs) {
      window.setTimeout(() => {
        unsubscribe();
        resolve();
      }, timeoutMs);
    }
  });
}

const toolDefinitions: ToolDefinition[] = [
  {
    name: "get_visible_graph",
    description: "現在 frontend に描画されているノード、エッジ、選択状態、active node を取得する",
    input_schema: {
      type: "object",
      properties: {
        include_content: { type: "boolean", default: false },
        selected_only: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        nodes: { type: "array" },
        edges: { type: "array" },
        selected_node_ids: { type: "array" },
        active_node_id: { type: ["string", "null"] },
      },
      required: ["nodes", "edges", "selected_node_ids", "active_node_id"],
      additionalProperties: false,
    },
    invoke(input) {
      const parsed = requireObject(input);
      rejectUnknownKeys(parsed, ["include_content", "selected_only"]);
      const includeContent = optionalBoolean(parsed, "include_content") ?? false;
      const selectedOnly = optionalBoolean(parsed, "selected_only") ?? false;
      const graphStore = useGraphStore.getState();
      const visibleGraph = currentVisibleGraph();
      const persistedNodeIds = new Set(graphStore.persistedNodes.map((node) => node.id));
      const filteredNodes = visibleGraph.nodes.filter((node) => {
        if (!selectedOnly) {
          return true;
        }
        return graphStore.selectedNodeIds.includes(node.id);
      });
      return {
        nodes: filteredNodes.map((node) => {
          const mapped = mapVisibleNode(node, persistedNodeIds.has(node.id) ? "persisted" : "frontend_draft");
          if (!includeContent) {
            mapped.content_md = null;
          }
          return mapped;
        }),
        edges: visibleGraph.edges.map(mapVisibleEdge),
        selected_node_ids: graphStore.selectedNodeIds,
        active_node_id: graphStore.activeNodeId,
      };
    },
  },
  {
    name: "get_selected_nodes",
    description: "現在選択中のノード集合を、agent が次の文脈入力に使える形で取得する",
    input_schema: {
      type: "object",
      properties: {
        include_content: { type: "boolean", default: true },
      },
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        nodes: { type: "array" },
        count: { type: "integer", minimum: 0 },
      },
      required: ["nodes", "count"],
      additionalProperties: false,
    },
    invoke(input) {
      const parsed = requireObject(input);
      rejectUnknownKeys(parsed, ["include_content"]);
      const includeContent = optionalBoolean(parsed, "include_content") ?? true;
      const graphStore = useGraphStore.getState();
      const persistedNodeIds = new Set(graphStore.persistedNodes.map((node) => node.id));
      const nodes = ensureNodesExist(graphStore.selectedNodeIds).map((node) => {
        const mapped = mapVisibleNode(node, persistedNodeIds.has(node.id) ? "persisted" : "frontend_draft");
        if (!includeContent) {
          mapped.content_md = null;
        }
        return mapped;
      });
      return { nodes, count: nodes.length };
    },
  },
  {
    name: "get_active_node_detail",
    description: "現在 active なノードの detail surface 情報を取得する。active node が未設定なら null を返す",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        active_node_id: { type: ["string", "null"] },
        title: { type: ["string", "null"] },
        content_md: { type: ["string", "null"] },
        referenced_nodes: { type: "array" },
        actions: { type: "array" },
      },
      required: ["active_node_id", "title", "content_md", "referenced_nodes", "actions"],
      additionalProperties: false,
    },
    invoke(input) {
      const parsed = requireObject(input);
      rejectUnknownKeys(parsed, []);
      const graphStore = useGraphStore.getState();
      if (!graphStore.activeNodeId) {
        return { active_node_id: null, title: null, content_md: null, actions: [] };
      }
      const node = currentVisibleGraph().nodes.find((candidate) => candidate.id === graphStore.activeNodeId);
      if (!node) {
        return { active_node_id: null, title: null, content_md: null, actions: [] };
      }
      return {
        active_node_id: node.id,
        title: typeof node.data?.label === "string" ? node.data.label : null,
        content_md: typeof node.data?.contentMd === "string" ? node.data.contentMd : null,
        referenced_nodes: mapVisibleNode(node, "frontend_draft").referenced_nodes,
        actions: Array.isArray(node.data?.actions) ? node.data.actions : [],
      };
    },
  },
  {
    name: "select_nodes",
    description: "frontend 上の選択ノード集合を更新する。複数選択コンテキストの入力面として使う",
    input_schema: {
      type: "object",
      properties: {
        node_ids: { type: "array", items: { type: "string" } },
        mode: { type: "string", enum: ["replace", "add", "remove"], default: "replace" },
      },
      required: ["node_ids"],
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        selected_node_ids: { type: "array" },
        count: { type: "integer", minimum: 0 },
      },
      required: ["selected_node_ids", "count"],
      additionalProperties: false,
    },
    invoke(input) {
      const parsed = requireObject(input);
      rejectUnknownKeys(parsed, ["node_ids", "mode"]);
      const nodeIds = requiredStringArray(parsed, "node_ids");
      const mode = optionalString(parsed, "mode") ?? "replace";
      if (!["replace", "add", "remove"].includes(mode)) {
        throw toolError("INVALID_INPUT", "mode must be replace, add, or remove");
      }
      ensureNodesExist(nodeIds);
      const graphStore = useGraphStore.getState();
      const nextIds = new Set(graphStore.selectedNodeIds);
      if (mode === "replace") {
        graphStore.setSelectedNodes(nodeIds);
      } else if (mode === "add") {
        nodeIds.forEach((nodeId) => nextIds.add(nodeId));
        graphStore.setSelectedNodes([...nextIds]);
      } else {
        nodeIds.forEach((nodeId) => nextIds.delete(nodeId));
        graphStore.setSelectedNodes([...nextIds]);
      }
      return {
        selected_node_ids: useGraphStore.getState().selectedNodeIds,
        count: useGraphStore.getState().selectedNodeIds.length,
      };
    },
  },
  {
    name: "open_node_detail",
    description: "指定ノードを active node に設定し、node card の detail surface を開く",
    input_schema: {
      type: "object",
      properties: {
        node_id: { type: "string" },
      },
      required: ["node_id"],
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        active_node_id: { type: "string" },
        opened: { type: "boolean" },
      },
      required: ["active_node_id", "opened"],
      additionalProperties: false,
    },
    invoke(input) {
      const parsed = requireObject(input);
      rejectUnknownKeys(parsed, ["node_id"]);
      const nodeId = requiredString(parsed, "node_id");
      ensureNodesExist([nodeId]);
      const graphStore = useGraphStore.getState();
      graphStore.setActiveNode(nodeId);
      graphStore.expandNode(nodeId);
      return { active_node_id: nodeId, opened: true };
    },
  },
  {
    name: "create_selectable_nodes",
    description: "agent が候補ノード群を frontend 上に一時表示し、ユーザーに選択させるための選択用ノードセットを作成する",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        instruction: { type: "string" },
        selection_mode: { type: "string", enum: ["single", "multiple"], default: "single" },
        options: { type: "array", minItems: 1 },
        anchor_node_id: { type: ["string", "null"] },
        expires_in_ms: { type: ["integer", "null"], minimum: 1 },
      },
      required: ["title", "instruction", "options"],
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        selection_group_id: { type: "string" },
        created_node_ids: { type: "array" },
        selection_mode: { type: "string", enum: ["single", "multiple"] },
        pending_user_selection: { type: "boolean" },
      },
      required: ["selection_group_id", "created_node_ids", "selection_mode", "pending_user_selection"],
      additionalProperties: false,
    },
    invoke(input) {
      const parsed = requireObject(input);
      rejectUnknownKeys(parsed, ["title", "instruction", "selection_mode", "options", "anchor_node_id", "expires_in_ms"]);
      const title = requiredString(parsed, "title");
      const instruction = requiredString(parsed, "instruction");
      const selectionMode = optionalString(parsed, "selection_mode") ?? "single";
      if (!["single", "multiple"].includes(selectionMode)) {
        throw toolError("INVALID_INPUT", "selection_mode must be single or multiple");
      }
      const options = parsed.options;
      if (!Array.isArray(options) || options.length === 0) {
        throw toolError("INVALID_INPUT", "options must contain at least one option");
      }
      const anchorNodeId = optionalString(parsed, "anchor_node_id") ?? null;
      if (anchorNodeId) {
        ensureNodesExist([anchorNodeId]);
      }
      const expiresInMs = optionalInteger(parsed, "expires_in_ms") ?? null;
      const groupId = `sg-${Date.now()}`;
      useAgentInteractionStore.getState().createGroup({
        selection_group_id: groupId,
        title,
        instruction,
        selection_mode: selectionMode as SelectionMode,
        anchor_node_id: anchorNodeId,
        expires_in_ms: expiresInMs,
        options: options.map((option) => {
          if (!isRecord(option)) {
            throw toolError("INVALID_INPUT", "each option must be an object");
          }
          const optionId = requiredString(option, "option_id");
          const label = requiredString(option, "label");
          return {
            option_id: optionId,
            label,
            reason: optionalString(option, "reason") ?? null,
            content_md: optionalString(option, "content_md") ?? null,
            metadata: isRecord(option.metadata) ? option.metadata : null,
            parameters: null,
            selected: false,
          };
        }),
      });
      return {
        selection_group_id: groupId,
        created_node_ids: options.map((option) => (option as Record<string, unknown>).option_id),
        selection_mode: selectionMode,
        pending_user_selection: true,
      };
    },
  },
  {
    name: "get_selection_group_result",
    description: "create_selectable_nodes で作成した選択用ノード群に対する、ユーザーの選択結果を取得する",
    input_schema: {
      type: "object",
      properties: {
        selection_group_id: { type: "string" },
        wait_for_user: { type: "boolean", default: false },
        timeout_ms: { type: ["integer", "null"], minimum: 1 },
      },
      required: ["selection_group_id"],
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        selection_group_id: { type: "string" },
        status: { type: "string", enum: ["pending", "selected", "expired", "cancelled"] },
        selected_option_ids: { type: "array" },
        selected_node_ids: { type: "array" },
      },
      required: ["selection_group_id", "status", "selected_option_ids", "selected_node_ids"],
      additionalProperties: false,
    },
    async invoke(input) {
      const parsed = requireObject(input);
      rejectUnknownKeys(parsed, ["selection_group_id", "wait_for_user", "timeout_ms"]);
      const selectionGroupId = requiredString(parsed, "selection_group_id");
      const waitForUser = optionalBoolean(parsed, "wait_for_user") ?? false;
      const timeoutMs = optionalInteger(parsed, "timeout_ms") ?? null;
      if (waitForUser) {
        await waitForSelectionGroup(selectionGroupId, timeoutMs);
      }
      const group = useAgentInteractionStore.getState().groups[selectionGroupId];
      if (!group) {
        throw toolError("NOT_FOUND", "selection_group_id was not found");
      }
      const selectedOptionIds = group.options.filter((option) => option.selected).map((option) => option.option_id);
      return {
        selection_group_id: selectionGroupId,
        status: group.status,
        selected_option_ids: selectedOptionIds,
        selected_node_ids: selectedOptionIds,
      };
    },
  },
  {
    name: "submit_ask",
    description: "Ask フォーム相当の入力で新規 RunAct を開始する。選択中ノードは context_node_ids として同送できる",
    input_schema: {
      type: "object",
      properties: {
        user_message: { type: "string", minLength: 1 },
        act_type: { type: "string", enum: ["explore", "consult", "investigate"] },
        topic_id: { type: "string" },
        workspace_id: { type: "string" },
        context_node_ids: { type: "array", items: { type: "string" } },
      },
      required: ["user_message", "act_type", "topic_id", "workspace_id"],
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        request_id: { type: ["string", "null"] },
        accepted: { type: "boolean" },
        stream_state: { type: ["string", "null"], enum: ["running", "error", null] },
        clarification: {
          type: ["object", "null"],
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            suggested_action: { type: "string", enum: ["select_node", "retry_without_context", "none"] },
            candidate_options: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  node_id: { type: "string" },
                  label: { type: "string" },
                  reason: { type: ["string", "null"] },
                },
                required: ["node_id", "label"],
                additionalProperties: false,
              },
            },
          },
          required: ["code", "message", "suggested_action"],
          additionalProperties: false,
        },
      },
      required: ["request_id", "accepted", "stream_state", "clarification"],
      additionalProperties: false,
    },
    async invoke(input) {
      const parsed = requireObject(input);
      rejectUnknownKeys(parsed, ["user_message", "act_type", "topic_id", "workspace_id", "tree_id", "context_node_ids", "llm_config", "grounding_config", "thinking_config", "research_config"]);
      const query = requiredString(parsed, "user_message");
      const actType = requiredString(parsed, "act_type") as "explore" | "consult" | "investigate";
      const workspaceId = requiredString(parsed, "workspace_id");
      const topicId = requiredString(parsed, "topic_id");
      const explicitContextNodeIds = optionalStringArray(parsed, "context_node_ids") ?? [];
      if (explicitContextNodeIds.length > 0) {
        ensureNodesExist(explicitContextNodeIds);
      }
      const prepared = await prepareSubmitAskRun(localFrontendToolClient, {
        userMessage: query,
        explicitContextNodeIds,
      });
      if (prepared.status !== "ready") {
        return {
          request_id: null,
          accepted: false,
          stream_state: null,
          clarification: prepared.clarification,
        };
      }
      const { requestId } = startActRun({
        targetNodeId: null,
        query,
        workspaceId,
        topicId,
        options: { actType, contextNodeIds: prepared.contextNodeIds },
      });
      return { request_id: requestId, accepted: true, stream_state: "running", clarification: null };
    },
  },
  {
    name: "run_act_with_context",
    description: "起点ノードと文脈ノードを指定して派生 Act を開始する。node action の run_act 相当",
    input_schema: {
      type: "object",
      properties: {
        anchor_node_id: { type: "string" },
        user_message: { type: "string", minLength: 1 },
        context_node_ids: { type: "array", items: { type: "string" } },
        act_type: { type: "string", enum: ["explore", "consult", "investigate"] },
      },
      required: ["anchor_node_id", "user_message", "act_type"],
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        request_id: { type: ["string", "null"] },
        accepted: { type: "boolean" },
        anchor_node_id: { type: "string" },
        stream_state: { type: ["string", "null"], enum: ["running", "error", null] },
        clarification: {
          type: ["object", "null"],
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            suggested_action: { type: "string", enum: ["select_node", "retry_without_context", "none"] },
            candidate_options: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  node_id: { type: "string" },
                  label: { type: "string" },
                  reason: { type: ["string", "null"] },
                },
                required: ["node_id", "label"],
                additionalProperties: false,
              },
            },
          },
          required: ["code", "message", "suggested_action"],
          additionalProperties: false,
        },
      },
      required: ["request_id", "accepted", "anchor_node_id", "stream_state", "clarification"],
      additionalProperties: false,
    },
    async invoke(input) {
      const parsed = requireObject(input);
      rejectUnknownKeys(parsed, ["anchor_node_id", "user_message", "context_node_ids", "act_type", "llm_config", "grounding_config", "thinking_config", "research_config"]);
      const anchorNodeId = requiredString(parsed, "anchor_node_id");
      ensureNodesExist([anchorNodeId]);
      const query = requiredString(parsed, "user_message");
      const actType = requiredString(parsed, "act_type") as "explore" | "consult" | "investigate";
      const explicitContextNodeIds = optionalStringArray(parsed, "context_node_ids") ?? [];
      if (explicitContextNodeIds.length > 0) {
        ensureNodesExist(explicitContextNodeIds);
      }
      const prepared = await prepareAnchoredActRun(localFrontendToolClient, {
        anchorNodeId,
        userMessage: query,
        explicitContextNodeIds,
      });
      if (prepared.status !== "ready") {
        return {
          request_id: null,
          accepted: false,
          anchor_node_id: anchorNodeId,
          stream_state: null,
          clarification: prepared.clarification,
        };
      }
      const { requestId } = startActRun({
        targetNodeId: anchorNodeId,
        query,
        options: { actType, contextNodeIds: prepared.contextNodeIds },
      });
      return {
        request_id: requestId,
        accepted: true,
        anchor_node_id: anchorNodeId,
        stream_state: "running",
        clarification: null,
      };
    },
  },
  {
    name: "set_stream_preferences",
    description: "thought 表示や、auto grounding を上書きする明示設定など、stream 表示と送信の既定設定を更新する",
    input_schema: {
      type: "object",
      properties: {
        show_thoughts: { type: "boolean" },
        include_thoughts: { type: "boolean" },
        use_web_grounding: { type: ["boolean", "null"] },
        model_profile: { type: "string", enum: ["flash", "deep_research"] },
      },
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        show_thoughts: { type: "boolean" },
        include_thoughts: { type: "boolean" },
        use_web_grounding: { type: ["boolean", "null"] },
        model_profile: { type: "string" },
      },
      required: ["show_thoughts", "include_thoughts", "use_web_grounding", "model_profile"],
      additionalProperties: false,
    },
    invoke(input) {
      const parsed = requireObject(input);
      rejectUnknownKeys(parsed, ["show_thoughts", "include_thoughts", "use_web_grounding", "model_profile"]);
      const useWebGrounding = parsed.use_web_grounding;
      if (useWebGrounding !== undefined && useWebGrounding !== null && typeof useWebGrounding !== "boolean") {
        throw toolError("INVALID_INPUT", "use_web_grounding must be boolean or null");
      }
      useStreamPreferencesStore.getState().setPreferences({
        showThoughts: optionalBoolean(parsed, "show_thoughts"),
        includeThoughts: optionalBoolean(parsed, "include_thoughts"),
        useWebGroundingOverride: useWebGrounding === undefined ? undefined : (useWebGrounding as boolean | null),
        modelProfile: optionalString(parsed, "model_profile") as "flash" | "deep_research" | undefined,
      });
      const next = useStreamPreferencesStore.getState();
      return {
        show_thoughts: next.showThoughts,
        include_thoughts: next.includeThoughts,
        use_web_grounding: next.useWebGroundingOverride,
        model_profile: next.modelProfile,
      };
    },
  },
  {
    name: "report_stream_error",
    description: "stream 中の terminal.error、購読例外、予期しない event を frontend の dev console と計測へ記録する",
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string", enum: ["terminal_error", "stream_exception", "unexpected_event", "reducer_failure"] },
        request_id: { type: ["string", "null"] },
        trace_id: { type: ["string", "null"] },
        stage: { type: ["string", "null"] },
        retryable: { type: ["boolean", "null"] },
        message: { type: "string" },
        raw_event: { type: ["object", "null"] },
      },
      required: ["source", "message"],
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        logged: { type: "boolean" },
        masked_fields: { type: "array" },
      },
      required: ["logged", "masked_fields"],
      additionalProperties: false,
    },
    invoke(input) {
      const parsed = requireObject(input);
      rejectUnknownKeys(parsed, ["source", "request_id", "trace_id", "stage", "retryable", "message", "raw_event"]);
      const source = requiredString(parsed, "source");
      const message = requiredString(parsed, "message");
      const rawEvent = isRecord(parsed.raw_event) ? parsed.raw_event : null;
      console.error("[FrontendTool:report_stream_error]", {
        source,
        request_id: optionalString(parsed, "request_id") ?? null,
        trace_id: optionalString(parsed, "trace_id") ?? null,
        stage: optionalString(parsed, "stage") ?? null,
        retryable: optionalBoolean(parsed, "retryable") ?? null,
        message,
        raw_event: rawEvent,
      });
      return { logged: true, masked_fields: [] };
    },
  },
];

const toolMap = new Map(toolDefinitions.map((tool) => [tool.name, tool]));

const localFrontendToolClient = {
  available: () => true,
  listTools: () => frontendToolServer.listTools(),
  invokeTool: (name: string, input: unknown) => frontendToolServer.invokeTool(name, input),
};

export const frontendToolServer = {
  server_name: "action-frontend-tools",
  server_version: "0.1.0",
  capabilities: { tools: true },
  listTools() {
    return toolDefinitions.map(({ name, description, input_schema, output_schema }) => ({
      name,
      description,
      input_schema,
      output_schema,
    }));
  },
  async invokeTool(name: string, input: unknown) {
    const tool = toolMap.get(name);
    if (!tool) {
      return { ok: false as const, error: toolError("NOT_FOUND", `Unknown tool: ${name}`) };
    }
    try {
      const output = await tool.invoke(requireObject(input));
      return { ok: true as const, output };
    } catch (error) {
      const toolFailure = isRecord(error) && typeof error.code === "string"
        ? (error as ToolError)
        : toolError("INTERNAL", error instanceof Error ? error.message : "Unknown tool error", true);
      return { ok: false as const, error: toolFailure };
    }
  },
};
