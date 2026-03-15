"use client";

import { v4 as uuidv4 } from "uuid";

import { actService } from "@/services/act";
import { actDraftService } from "@/services/actDraft/firestore";
import { useGraphStore } from "@/features/graph/store";
import { useRunContextStore } from "@/features/context/store/run-context-store";
import { useStreamPreferencesStore } from "@/features/agentTools/store/stream-preferences-store";
import type { PatchOp, StreamActOptions } from "@/services/act/port";

function normalizePatchNodeId(nodeId: string, targetNodeId: string | null) {
  if (nodeId === "root" && targetNodeId) {
    return targetNodeId;
  }
  return nodeId;
}

export type StartActRunParams = {
  targetNodeId: string | null;
  query: string;
  workspaceId?: string;
  topicId?: string;
  options?: StreamActOptions & { clear?: boolean };
};

export type StartActRunResult = {
  requestId: string;
  cancel: () => void;
};

function uniqueNodeIds(nodeIds: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  nodeIds.forEach((nodeId) => {
    const value = nodeId.trim();
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    ordered.push(value);
  });
  return ordered;
}

export function startActRun({ targetNodeId, query, workspaceId, topicId, options }: StartActRunParams): StartActRunResult {
  const graphStore = useGraphStore.getState();
  const runContext = useRunContextStore.getState();
  const preferences = useStreamPreferencesStore.getState();
  const requestId = options?.requestId ?? uuidv4();
  const effectiveWorkspaceId = workspaceId ?? runContext.workspaceId;
  const effectiveTopicId = topicId ?? runContext.topicId;
  const selectedNodeIds = graphStore.selectedNodeIds;
  const referencedNodeIds = uniqueNodeIds([
    ...(targetNodeId ? [targetNodeId] : []),
    ...(options?.contextNodeIds ?? selectedNodeIds),
  ]);

  if (effectiveWorkspaceId !== runContext.workspaceId || effectiveTopicId !== runContext.topicId) {
    runContext.setContext(effectiveWorkspaceId, effectiveTopicId);
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem("run_context.workspaceId", effectiveWorkspaceId);
    window.localStorage.setItem("run_context.topicId", effectiveTopicId);
  }

  graphStore.setStreamRunning(true);
  if (targetNodeId) {
    graphStore.addStreamingNode(targetNodeId);
  }

  const touchedNodeIds = new Set<string>();
  const persistTouchedNodes = async () => {
    const { actNodes } = useGraphStore.getState();
    const nodesById = new Map(actNodes.map((node) => [node.id, node]));
    await Promise.all(
      [...touchedNodeIds].map(async (nodeId) => {
        const node = nodesById.get(nodeId);
        if (!node) {
          return;
        }
        await actDraftService.saveDraftSnapshot(effectiveWorkspaceId, effectiveTopicId, nodeId, {
          title: typeof node.data?.label === "string" ? node.data.label : query,
          kind: typeof node.data?.kind === "string" ? node.data.kind : "act",
          contentMd: typeof node.data?.contentMd === "string" ? node.data.contentMd : "",
          referencedNodeIds: Array.isArray(node.data?.referencedNodeIds)
            ? node.data.referencedNodeIds.filter((value): value is string => typeof value === "string")
            : referencedNodeIds,
        });
      }),
    );
  };

  const cancel = actService.streamAct(
    query,
    (patch: PatchOp) => {
      const normalizedNodeId = normalizePatchNodeId(patch.nodeId, targetNodeId);
      touchedNodeIds.add(normalizedNodeId);
      useGraphStore.getState().addStreamingNode(normalizedNodeId);

      if (patch.type === "upsert" && patch.data) {
        const existingNode = useGraphStore.getState().actNodes.find((node) => node.id === normalizedNodeId);
        useGraphStore.getState().addOrUpdateActNode(normalizedNodeId, {
          label:
            patch.data.label ??
            (existingNode ? undefined : targetNodeId === null ? query : undefined),
          kind: patch.data.kind ?? "act",
          referencedNodeIds:
            patch.data.referencedNodeIds ??
            (existingNode
              ? undefined
              : referencedNodeIds),
        });
        return;
      }

      if (patch.type === "append_md" && patch.data?.contentMd) {
        useGraphStore.getState().appendActNodeContent(normalizedNodeId, patch.data.contentMd);
      }
    },
    async () => {
      await persistTouchedNodes();
      useGraphStore.getState().clearStreamingNodes([...touchedNodeIds]);
      useGraphStore.getState().setStreamRunning(false);
    },
    (error) => {
      void persistTouchedNodes();
      console.error("Stream error:", error);
      useGraphStore.getState().clearStreamingNodes([...touchedNodeIds]);
      useGraphStore.getState().setStreamRunning(false);
    },
    {
      ...options,
      requestId,
      anchorNodeId: targetNodeId ?? options?.anchorNodeId,
      contextNodeIds: options?.contextNodeIds ?? selectedNodeIds,
      enableGrounding: options?.enableGrounding ?? preferences.useWebGrounding,
      includeThoughts: options?.includeThoughts ?? preferences.includeThoughts,
      modelProfile: options?.modelProfile ?? preferences.modelProfile,
    },
  );

  return { requestId, cancel };
}
