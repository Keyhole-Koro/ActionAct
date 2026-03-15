"use client";

export const FRONTEND_TOOL_CLIENT_SOURCE = "action-frontend-tools-client";
export const FRONTEND_TOOL_SERVER_SOURCE = "action-frontend-tools-server";
export const DEFAULT_FRONTEND_TOOL_TRANSPORT_TIMEOUT_MS = 5000;

export type FrontendToolDescriptor = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
};

export type FrontendToolBridgeRequest =
  | {
      source: typeof FRONTEND_TOOL_CLIENT_SOURCE;
      kind: "get_status";
      request_id: string;
    }
  | {
      source: typeof FRONTEND_TOOL_CLIENT_SOURCE;
      kind: "list_tools";
      request_id: string;
    }
  | {
      source: typeof FRONTEND_TOOL_CLIENT_SOURCE;
      kind: "invoke_tool";
      request_id: string;
      tool_name: string;
      input: unknown;
    };

export type FrontendToolBridgeResponse =
  | {
      source: typeof FRONTEND_TOOL_SERVER_SOURCE;
      kind: "transport_status";
      request_id: string;
      available: boolean;
      server_name: string;
      server_version: string;
      capabilities: { tools: boolean };
    }
  | {
      source: typeof FRONTEND_TOOL_SERVER_SOURCE;
      kind: "tool_list";
      request_id: string;
      server_name: string;
      server_version: string;
      capabilities: { tools: boolean };
      tools: FrontendToolDescriptor[];
    }
  | {
      source: typeof FRONTEND_TOOL_SERVER_SOURCE;
      kind: "tool_result";
      request_id: string;
      output: unknown;
    }
  | {
      source: typeof FRONTEND_TOOL_SERVER_SOURCE;
      kind: "tool_error";
      request_id: string;
      error: unknown;
    };

export type FrontendToolTransportRequestOptions = {
  timeout_ms?: number;
};

export type FrontendToolTransport = {
  available: () => boolean;
  request: (
    message: FrontendToolBridgeRequest,
    options?: FrontendToolTransportRequestOptions,
  ) => Promise<FrontendToolBridgeResponse>;
};

function randomRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `frontend-tool-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createPostMessageFrontendToolClient(
  targetWindow: Window = window,
  targetOrigin: string = window.location.origin,
) {
  const send = async (
    message: FrontendToolBridgeRequest,
    options?: FrontendToolTransportRequestOptions,
  ): Promise<FrontendToolBridgeResponse> => {
    const timeoutMs = options?.timeout_ms ?? DEFAULT_FRONTEND_TOOL_TRANSPORT_TIMEOUT_MS;

    return new Promise<FrontendToolBridgeResponse>((resolve, reject) => {
      const onMessage = (event: MessageEvent<unknown>) => {
        if (event.source !== targetWindow) {
          return;
        }
        const data = event.data;
        if (!data || typeof data !== "object") {
          return;
        }
        const response = data as Partial<FrontendToolBridgeResponse>;
        if (response.source !== FRONTEND_TOOL_SERVER_SOURCE || response.request_id !== message.request_id) {
          return;
        }
        targetWindow.removeEventListener("message", onMessage);
        targetWindow.clearTimeout(timeoutId);
        resolve(response as FrontendToolBridgeResponse);
      };

      const timeoutId = targetWindow.setTimeout(() => {
        targetWindow.removeEventListener("message", onMessage);
        reject(new Error(`Frontend tool bridge timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      targetWindow.addEventListener("message", onMessage);
      targetWindow.postMessage(message, targetOrigin);
    });
  };

  return {
    getStatus(options?: FrontendToolTransportRequestOptions) {
      return send(
        {
          source: FRONTEND_TOOL_CLIENT_SOURCE,
          kind: "get_status",
          request_id: randomRequestId(),
        },
        options,
      );
    },
    listTools(options?: FrontendToolTransportRequestOptions) {
      return send(
        {
          source: FRONTEND_TOOL_CLIENT_SOURCE,
          kind: "list_tools",
          request_id: randomRequestId(),
        },
        options,
      );
    },
    invokeTool(tool_name: string, input: unknown, options?: FrontendToolTransportRequestOptions) {
      return send(
        {
          source: FRONTEND_TOOL_CLIENT_SOURCE,
          kind: "invoke_tool",
          request_id: randomRequestId(),
          tool_name,
          input,
        },
        options,
      );
    },
  };
}
