import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { v4 as uuidv4 } from "uuid";

import { ActService, ActType, type RunActEvent, type PatchOp as RpcPatchOp } from "@/gen/act/v1/act_pb";
import { useRunContextStore } from "@/features/context/store/run-context-store";
import type { ActPort, PatchOp } from "./port";

function getBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_RPC_BASE_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_RPC_BASE_URL is required");
  }
  return baseUrl;
}

function getCookie(name: string): string {
  const all = typeof document !== "undefined" ? document.cookie : "";
  if (!all) {
    return "";
  }
  const key = `${name}=`;
  const pair = all
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(key));
  return pair ? decodeURIComponent(pair.slice(key.length)) : "";
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {};

  // If auth token is preloaded by auth flow, forward it to act-api.
  const idToken = typeof window !== "undefined" ? window.localStorage.getItem("firebase_id_token") : null;
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const csrf = getCookie("csrf_token");
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
    return {
      type: "append_md",
      nodeId: op.nodeId,
      data: { contentMd: op.content ?? "" },
    };
  }

  if (op.op === "upsert") {
    const label = (op.content ?? "").trim();
    return {
      type: "upsert",
      nodeId: op.nodeId,
      data: {
        label: label.length > 0 ? label : "Node",
        type: "concept",
        contentMd: op.content ?? "",
      },
    };
  }

  return null;
}

function handleEvent(event: RunActEvent, onPatch: (patch: PatchOp) => void, onDone: () => void, onError: (err: Error) => void): void {
  if (event.event.case === "patchOps") {
    for (const op of event.event.value.ops) {
      const mapped = toUiPatch(op);
      if (mapped) {
        onPatch(mapped);
      }
    }
    return;
  }

  if (event.event.case === "textDelta") {
    onPatch({
      type: "append_md",
      nodeId: "root",
      data: { contentMd: event.event.value.text },
    });
    return;
  }

  if (event.event.case === "terminal") {
    const terminal = event.event.value;
    if (terminal.error) {
      const stage = terminal.error.stage ? `[${terminal.error.stage}] ` : "";
      onError(new Error(`${stage}${terminal.error.message || "RunAct failed"}`));
      return;
    }
    if (terminal.done) {
      onDone();
    }
  }
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
    streamAct(query, onPatch, onDone, onError) {
      const abortController = new AbortController();

      void (async () => {
        try {
          const { workspaceId, topicId } = useRunContextStore.getState();
          const response = client.runAct(
            {
              topicId,
              workspaceId,
              requestId: uuidv4(),
              actType: ActType.EXPLORE,
              userMessage: query,
            },
            {
              signal: abortController.signal,
              headers: buildHeaders(),
            },
          );

          for await (const event of response) {
            if (abortController.signal.aborted) {
              return;
            }
            handleEvent(event, onPatch, onDone, onError);
          }

          if (!abortController.signal.aborted) {
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
