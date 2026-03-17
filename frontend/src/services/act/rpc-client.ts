import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { v4 as uuidv4 } from "uuid";

import { ActService, ActType, type RunActEvent, type PatchOp as RpcPatchOp } from "@/gen/act/v1/act_pb";
import { useRunContextStore } from "@/features/context/store/run-context-store";
import { config } from "@/lib/config";
import { applyResponseLanguagePreference } from "@/lib/response-language-preference";
import { getCSRFToken } from "@/services/firebase/csrf";
import { getFirebaseIdToken } from "@/services/firebase/token";
import type { ActPort, PatchOp, StreamActOptions } from "./port";

function getBaseUrl(): string {
  return config.rpcBaseUrl;
}

function mapActType(actType: StreamActOptions["actType"]): ActType {
  switch (actType) {
    case "consult":
      return ActType.CONSULT;
    case "investigate":
      return ActType.INVESTIGATE;
    case "explore":
    default:
      return ActType.EXPLORE;
  }
}

function resolveLlmModel(modelProfile: StreamActOptions["modelProfile"]): string {
  switch (modelProfile) {
    case "deep_research":
      return "deep_research";
    case "flash":
    default:
      return "flash";
  }
}

async function buildHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {};

  const idToken = await getFirebaseIdToken();
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const csrf = getCSRFToken();
  if (csrf) {
    headers["X-CSRF-Token"] = csrf;
  }

  return headers;
}

function toUiPatch(op: RpcPatchOp): PatchOp | null {
  if (!op.nodeId) {
    return null;
  }

  if (op.op === "append_md") {
    const hasSeq = typeof op.seq === "bigint" && op.seq > BigInt(0);
    return {
      type: "append_md",
      nodeId: op.nodeId,
      data: {
        contentMd: op.content ?? "",
        ...(hasSeq ? { seq: op.seq } : {}),
        ...(hasSeq ? { expectedOffset: op.expectedOffset } : {}),
      },
    };
  }

  if (op.op === "upsert") {
    return {
      type: "upsert",
      nodeId: op.nodeId,
      data: {
        kind: "act",
      },
    };
  }

  return null;
}

function toTextDeltaPatch(event: RunActEvent): PatchOp | null {
  if (event.event.case !== "textDelta") {
    return null;
  }

  const chunk = event.event.value.text ?? "";
  if (!chunk) {
    return null;
  }

  return {
    type: "text_delta",
    // Proto text_delta has no node_id. Root binding is resolved in act-runner.
    nodeId: "root",
    data: {
      contentMd: chunk,
      thoughtMd: chunk,
      isThought: event.isThought,
    },
  };
}

function handleEvent(
  event: RunActEvent,
  onPatch: (patch: PatchOp) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): { reachedTerminal: boolean } {
  if (event.event.case === "patchOps") {
    for (const op of event.event.value.ops) {
      const mapped = toUiPatch(op);
      if (mapped) {
        onPatch(mapped);
      }
    }
    return { reachedTerminal: false };
  }

  if (event.event.case === "textDelta") {
    const transientPatch = toTextDeltaPatch(event);
    if (transientPatch) {
      onPatch(transientPatch);
    }
    return { reachedTerminal: false };
  }

  if (event.event.case === "terminal") {
    const terminal = event.event.value;
    if (terminal.error) {
      const stage = terminal.error.stage ? `[${terminal.error.stage}] ` : "";
      onError(new Error(`${stage}${terminal.error.message || "RunAct failed"}`));
      return { reachedTerminal: true };
    }
    if (terminal.done) {
      const hasTraceMetadata =
        terminal.usedContextNodeIds.length > 0
        || terminal.usedSelectedNodeContexts.length > 0
        || terminal.usedTools.length > 0
        || terminal.usedSources.length > 0;
      if (hasTraceMetadata) {
        onPatch({
          type: "upsert",
          nodeId: "root",
          data: {
            usedContextNodeIds: terminal.usedContextNodeIds,
            usedSelectedNodeContexts: terminal.usedSelectedNodeContexts.map((ctx) => ({
              nodeId: ctx.nodeId,
              label: ctx.label || undefined,
              kind: ctx.kind || undefined,
              contextSummary: ctx.contextSummary || undefined,
              contentMd: ctx.contentMd || undefined,
              thoughtMd: ctx.thoughtMd || undefined,
              detailHtml: ctx.detailHtml || undefined,
            })),
            usedTools: terminal.usedTools,
            usedSources: terminal.usedSources.map((source) => ({
              id: source.id,
              kind: source.kind || undefined,
              label: source.label || undefined,
              uri: source.uri || undefined,
            })),
          },
        });
      }
      onDone();
      return { reachedTerminal: true };
    }
  }

  return { reachedTerminal: false };
}

export function createRpcActService(): ActPort {
  const transport = createConnectTransport({
    baseUrl: getBaseUrl(),
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        credentials: "include",
      }),
  });

  const client = createClient(ActService, transport);

  return {
    streamAct(query, onPatch, onDone, onError, options?: StreamActOptions) {
      const abortController = new AbortController();
      let terminalSeen = false;

      void (async () => {
        try {
          const runContext = useRunContextStore.getState();
          const workspaceId = options?.workspaceId ?? runContext.workspaceId;
          const topicId = options?.topicId ?? runContext.topicId;
          const queryWithLanguagePreference = applyResponseLanguagePreference(query);
          const model = resolveLlmModel(options?.modelProfile);
          const headers = await buildHeaders();
          console.info("[RunAct request]", {
            workspaceId,
            topicId,
            requestId: options?.requestId ?? null,
            actType: options?.actType ?? "explore",
            userMessage: queryWithLanguagePreference,
            userMediaCount: options?.userMedia?.length ?? 0,
            anchorNodeId: options?.anchorNodeId ?? "",
            contextNodeIds: options?.contextNodeIds ?? [],
            selectedNodeContextsCount: options?.selectedNodeContexts?.length ?? 0,
            llmConfig: {
              model,
              enableGrounding: options?.enableGrounding ?? false,
              enableThinking: options?.includeThoughts ?? false,
              modelProfile: options?.modelProfile ?? "flash",
            },
          });
          const response = client.runAct(
            {
              topicId,
              workspaceId,
              requestId: options?.requestId ?? uuidv4(),
              actType: mapActType(options?.actType),
              userMessage: queryWithLanguagePreference,
              userMedia: options?.userMedia ?? [],
              anchorNodeId: options?.anchorNodeId ?? "",
              contextNodeIds: options?.contextNodeIds ?? [],
              selectedNodeContexts: (options?.selectedNodeContexts ?? []).map((ctx) => ({
                nodeId: ctx.nodeId,
                label: ctx.label ?? "",
                kind: ctx.kind ?? "",
                contextSummary: ctx.contextSummary ?? "",
                contentMd: ctx.contentMd ?? "",
                thoughtMd: ctx.thoughtMd ?? "",
                detailHtml: ctx.detailHtml ?? "",
              })),
              llmConfig: {
                model,
                enableGrounding: options?.enableGrounding ?? false,
                enableThinking: options?.includeThoughts ?? false,
              },
            },
            {
              signal: abortController.signal,
              headers,
            },
          );

          for await (const event of response) {
            if (abortController.signal.aborted) {
              return;
            }

            if (terminalSeen) {
              continue;
            }

            const { reachedTerminal } = handleEvent(event, onPatch, onDone, onError);
            if (reachedTerminal) {
              terminalSeen = true;
            }
          }

          if (!abortController.signal.aborted && !terminalSeen) {
            onDone();
          }
        } catch (e) {
          if (!abortController.signal.aborted) {
            onError(e instanceof Error ? e : new Error(String(e)));
          }
        }
      })();

      return () => {
        abortController.abort();
      };
    },
  };
}
