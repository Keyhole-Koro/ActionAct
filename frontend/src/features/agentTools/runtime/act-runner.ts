"use client";

import { v4 as uuidv4 } from "uuid";
import { getAuth } from "firebase/auth";

import { actService } from "@/services/act";
import { actDraftService } from "@/services/actDraft/firestore";
import { useGraphStore } from "@/features/graph/store";
import { useRunContextStore } from "@/features/context/store/run-context-store";
import { useStreamPreferencesStore } from "@/features/agentTools/store/stream-preferences-store";
import { uniqueNodeIds } from "@/features/agentTools/utils";
import type { PatchOp, StreamActOptions } from "@/services/act/port";

const MAX_TRIGGER_DEPTH = 3;

export type StartActRunParams = {
  targetNodeId: string | null;
  query: string;
  workspaceId?: string;
  options?: StreamActOptions & { clear?: boolean };
  triggerDepth?: number;
};

export type StartActRunResult = {
  requestId: string;
  frontendNodeId: string;
  cancel: () => void;
};

function deriveAgentRole(kind: unknown): "search" | undefined {
  return kind === "agent_act" ? "search" : undefined;
}

function finalizeAgentNodes(nodeIds: Iterable<string>, status: "completed" | "failed") {
  const store = useGraphStore.getState();
  const actNodesById = new Map(store.actNodes.map((node) => [node.id, node]));
  for (const nodeId of nodeIds) {
    const node = actNodesById.get(nodeId);
    if (!node || node.data?.kind !== "agent_act") {
      continue;
    }
    store.addOrUpdateActNode(nodeId, {
      status,
      agentRole: "search",
    });
  }
}

function compactText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function buildSelectedNodeContexts(
  nodeIds: string[],
  persistedNodes: Array<{ id: string; data?: Record<string, unknown> }>,
  actNodes: Array<{ id: string; data?: Record<string, unknown> }>,
): NonNullable<StreamActOptions["selectedNodeContexts"]> {
  if (nodeIds.length === 0) {
    return [];
  }

  const nodeEntries: Array<[string, { id: string; data?: Record<string, unknown> }]> = [
    ...persistedNodes.map((node): [string, { id: string; data?: Record<string, unknown> }] => [node.id, node]),
    ...actNodes.map((node): [string, { id: string; data?: Record<string, unknown> }] => [node.id, node]),
  ];
  const nodeById = new Map<string, { id: string; data?: Record<string, unknown> }>(nodeEntries);

  return nodeIds.map((nodeId) => {
    const node = nodeById.get(nodeId);
    if (!node) {
      return { nodeId };
    }

    const data = node.data ?? {};
    const label = compactText(data.label, 120) ?? "";
    const kind = compactText(data.kind, 60);
    const contextSummary = compactText(data.contextSummary, 400);
    const contentMd = compactText(data.contentMd, 700);
    const thoughtMd = compactText(data.thoughtMd, 300);
    const detailHtml = compactText(data.detailHtml, 240);

    return {
      nodeId,
      label,
      kind: kind ?? undefined,
      contextSummary: contextSummary ?? undefined,
      contentMd: contentMd ?? undefined,
      thoughtMd: thoughtMd ?? undefined,
      detailHtml: detailHtml ?? undefined,
    };
  });
}

export function startActRun({ targetNodeId, query, workspaceId, options, triggerDepth = 0 }: StartActRunParams): StartActRunResult {
  const graphStore = useGraphStore.getState();
  const runContext = useRunContextStore.getState();
  const preferences = useStreamPreferencesStore.getState();
  const currentUserUid = getAuth().currentUser?.uid;
  const requestId = options?.requestId ?? uuidv4();
  const existingTargetNode = targetNodeId
    ? graphStore.actNodes.find((node) => node.id === targetNodeId)
    : undefined;
  const targetKind = typeof existingTargetNode?.data?.kind === "string" ? existingTargetNode.data.kind : undefined;
  const targetHasResolvedContent = [
    existingTargetNode?.data?.contentMd,
    existingTargetNode?.data?.contextSummary,
    existingTargetNode?.data?.detailHtml,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
  const targetHasStartedRun = existingTargetNode?.data?.hasStartedRun === true;
  const shouldForkFromExistingActNode = Boolean(
    targetNodeId
      && existingTargetNode
      && (targetKind === "act" || targetKind === "agent_act")
      && (targetHasStartedRun || targetHasResolvedContent),
  );
  const isExistingActTarget = Boolean(targetNodeId && existingTargetNode && !shouldForkFromExistingActNode);
  const frontendRootNodeId = isExistingActTarget && targetNodeId ? targetNodeId : `act-${requestId}`;
  const backendToFrontendNodeIds = new Map<string, string>([["root", frontendRootNodeId]]);
  if (targetNodeId) {
    backendToFrontendNodeIds.set(targetNodeId, frontendRootNodeId);
  }
  const effectiveWorkspaceId = workspaceId ?? runContext.workspaceId;
  const selectedNodeIds = graphStore.selectedNodeIds;
  const referencedNodeIds = uniqueNodeIds([
    ...(targetNodeId ? [targetNodeId] : []),
    ...(options?.contextNodeIds ?? selectedNodeIds),
  ]);
  const selectedNodeContexts = buildSelectedNodeContexts(
    options?.contextNodeIds ?? selectedNodeIds,
    graphStore.persistedNodes as Array<{ id: string; data?: Record<string, unknown> }>,
    graphStore.actNodes as Array<{ id: string; data?: Record<string, unknown> }>,
  );
  const existingFrontendRootNode = graphStore.actNodes.find((node) => node.id === frontendRootNodeId);

  if (effectiveWorkspaceId !== runContext.workspaceId) {
    runContext.setContext(effectiveWorkspaceId);
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem("run_context.workspaceId", effectiveWorkspaceId);
  }

  graphStore.setStreamRunning(true);
  if (existingFrontendRootNode) {
    graphStore.resetActNode(frontendRootNodeId, {
      label: query,
      referencedNodeIds,
    });
  }
  graphStore.addOrUpdateActNode(frontendRootNodeId, {
    hasStartedRun: true,
    ...(existingFrontendRootNode ? {} : {
      label: query,
      kind: "act",
      createdBy: "agent" as const,
      referencedNodeIds,
      ...(shouldForkFromExistingActNode && targetNodeId ? { parentId: targetNodeId } : {}),
    }),
  });
  graphStore.addStreamingNode(frontendRootNodeId);

  const touchedNodeIds = new Set<string>();
  const seenAppendSeqByNode = new Map<string, Set<bigint>>();
  const seenAppendSignaturesByNode = new Map<string, Set<string>>();
  const persistTouchedNodes = async () => {
    const { actNodes } = useGraphStore.getState();
    const nodesById = new Map(actNodes.map((node) => [node.id, node]));
    await Promise.all(
      [...touchedNodeIds].map(async (nodeId) => {
        const node = nodesById.get(nodeId);
        if (!node) {
          return;
        }
        await actDraftService.saveDraftSnapshot(effectiveWorkspaceId, nodeId, {
          title: typeof node.data?.label === "string" ? node.data.label : query,
          kind: typeof node.data?.kind === "string" ? node.data.kind : "act",
          status: node.data?.status === "running" || node.data?.status === "completed" || node.data?.status === "failed"
            ? node.data.status
            : undefined,
          agentRole: node.data?.agentRole === "search" ? "search" : deriveAgentRole(node.data?.kind),
          createdBy: node.data?.createdBy === "user" ? "user" : "agent",
          authorUid: typeof node.data?.authorUid === "string" ? node.data.authorUid : undefined,
          contentMd: typeof node.data?.contentMd === "string" ? node.data.contentMd : "",
          thoughtMd: typeof node.data?.thoughtMd === "string" ? node.data.thoughtMd : "",
          referencedNodeIds: Array.isArray(node.data?.referencedNodeIds)
            ? node.data.referencedNodeIds.filter((value): value is string => typeof value === "string")
            : referencedNodeIds,
          parentId: typeof node.data?.parentId === "string" ? node.data.parentId : undefined,
        });
      }),
    );
  };

  const resolveFrontendNodeId = (backendNodeId: string) => {
    const existing = backendToFrontendNodeIds.get(backendNodeId);
    if (existing) {
      return existing;
    }

    const mapped = `act-${requestId}-${backendNodeId}`;
    backendToFrontendNodeIds.set(backendNodeId, mapped);
    return mapped;
  };

  const getKnownFrontendNodeId = (backendNodeId: string) => {
    const mapped = backendToFrontendNodeIds.get(backendNodeId);
    if (mapped) {
      return mapped;
    }
    return graphStore.actNodes.some((node) => node.id === backendNodeId) ? backendNodeId : null;
  };

  const cancel = actService.streamAct(
    query,
    (patch: PatchOp) => {
      const normalizedNodeId = resolveFrontendNodeId(patch.nodeId);
      touchedNodeIds.add(normalizedNodeId);
      useGraphStore.getState().addStreamingNode(normalizedNodeId);

      if (patch.type === "upsert" && patch.data) {
        const existingNode = useGraphStore.getState().actNodes.find((node) => node.id === normalizedNodeId);
        const resolvedParentId = patch.data.parentId
          ? resolveFrontendNodeId(patch.data.parentId)
          : undefined;
        const resolvedCreatedBy = patch.data.createdBy ?? (existingNode ? undefined : "agent");
        useGraphStore.getState().addOrUpdateActNode(normalizedNodeId, {
          label:
            patch.data.label ??
            (existingNode ? undefined : query),
          kind: patch.data.kind ?? "act",
          status: patch.data.status ?? ((patch.data.kind ?? existingNode?.data?.kind) === "agent_act" ? "running" : undefined),
          agentRole: patch.data.agentRole ?? deriveAgentRole(patch.data.kind ?? existingNode?.data?.kind),
          createdBy: resolvedCreatedBy,
          ...(resolvedCreatedBy === 'user' && currentUserUid ? { authorUid: currentUserUid } : {}),
          referencedNodeIds:
            patch.data.referencedNodeIds ??
            (existingNode
              ? undefined
              : referencedNodeIds),
          usedContextNodeIds: patch.data.usedContextNodeIds,
          usedSelectedNodeContexts: patch.data.usedSelectedNodeContexts,
          usedTools: patch.data.usedTools,
          usedSources: patch.data.usedSources,
          ...(resolvedParentId ? { parentId: resolvedParentId } : {}),
          ...(patch.data.contentMd ? { contentMd: patch.data.contentMd } : {}),
        });
        if (resolvedParentId) {
          useGraphStore.getState().expandBranchNode(resolvedParentId);
        }
        return;
      }

      if (patch.type === "append_md" && patch.data?.contentMd) {
        const chunk = patch.data.contentMd;
        const currentNode = useGraphStore.getState().actNodes.find((node) => node.id === normalizedNodeId);
        const beforeLength = typeof currentNode?.data?.contentMd === "string"
          ? currentNode.data.contentMd.length
          : 0;

        if (typeof patch.data.expectedOffset === "number" && patch.data.expectedOffset >= 0 && patch.data.expectedOffset !== beforeLength) {
          console.warn("[RunAct] append_md dropped due to expectedOffset mismatch", {
            nodeId: normalizedNodeId,
            expectedOffset: patch.data.expectedOffset,
            actualOffset: beforeLength,
            requestId,
          });
          return;
        }

        if (typeof patch.data.seq === "bigint") {
          const seenSeqForNode = seenAppendSeqByNode.get(normalizedNodeId) ?? new Set<bigint>();
          if (seenSeqForNode.has(patch.data.seq)) {
            return;
          }
          seenSeqForNode.add(patch.data.seq);
          seenAppendSeqByNode.set(normalizedNodeId, seenSeqForNode);
          useGraphStore.getState().appendActNodeContent(normalizedNodeId, chunk);
          return;
        }

        const signature = `${beforeLength}:${chunk}`;
        const seenForNode = seenAppendSignaturesByNode.get(normalizedNodeId) ?? new Set<string>();
        if (seenForNode.has(signature)) {
          return;
        }
        seenForNode.add(signature);
        seenAppendSignaturesByNode.set(normalizedNodeId, seenForNode);
        useGraphStore.getState().appendActNodeContent(normalizedNodeId, chunk);
        return;
      }

      if (patch.type === "text_delta" && patch.data?.isThought && patch.data.thoughtMd) {
        useGraphStore.getState().appendActNodeThought(normalizedNodeId, patch.data.thoughtMd);
      }
    },
    async () => {
      finalizeAgentNodes(touchedNodeIds, "completed");
      await persistTouchedNodes();
      useGraphStore.getState().clearStreamingNodes([...touchedNodeIds]);
      useGraphStore.getState().setStreamRunning(false);
    },
    (error) => {
      finalizeAgentNodes(touchedNodeIds, "failed");
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
      selectedNodeContexts,
      enableGrounding: true,
      includeThoughts: true,
      modelProfile: options?.modelProfile ?? preferences.modelProfile,
    },
    triggerDepth < MAX_TRIGGER_DEPTH
      ? (trigger) => {
          if (trigger.action === "start_act") {
            try {
              const payload = JSON.parse(trigger.payloadJson) as Record<string, unknown>;
              const triggerQuery = typeof payload.user_message === "string" ? payload.user_message : "";
              const anchorNodeId = typeof payload.anchor_node_id === "string" ? payload.anchor_node_id : undefined;
              console.info("[RunAct] start_act received", {
                requestId,
                payloadJson: trigger.payloadJson,
                anchorNodeId: anchorNodeId ?? null,
                triggerQuery,
              });
              if (triggerQuery) {
                const resolvedAnchorNodeId = anchorNodeId ? getKnownFrontendNodeId(anchorNodeId) : null;
                if (anchorNodeId && !resolvedAnchorNodeId) {
                  console.warn("[RunAct] Dropping start_act because anchor_node_id does not resolve to a known frontend node", {
                    anchorNodeId,
                    requestId,
                    triggerQuery,
                    payloadJson: trigger.payloadJson,
                  });
                  return;
                }
                console.info("[RunAct] start_act launching child run", {
                  requestId,
                  anchorNodeId: anchorNodeId ?? null,
                  resolvedAnchorNodeId,
                  triggerQuery,
                });
                startActRun({
                  targetNodeId: resolvedAnchorNodeId,
                  query: triggerQuery,
                  workspaceId: effectiveWorkspaceId,
                  triggerDepth: triggerDepth + 1,
                });
              }
            } catch {
              console.warn("[RunAct] Failed to parse start_act payload", trigger.payloadJson);
            }
          }
        }
      : undefined,
  );

  return { requestId, frontendNodeId: frontendRootNodeId, cancel };
}
