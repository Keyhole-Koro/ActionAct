"use client";

import { useEffect } from "react";

import { frontendToolServer } from "@/features/agentTools/runtime/frontend-tool-registry";
import {
  DEFAULT_FRONTEND_TOOL_TRANSPORT_TIMEOUT_MS,
  FRONTEND_TOOL_CLIENT_SOURCE,
  type FrontendToolBridgeRequest,
  type FrontendToolBridgeResponse,
  type FrontendToolTransport,
} from "@/features/agentTools/runtime/frontend-tool-transport";

function transportMetadata() {
  return {
    available: true,
    server_name: frontendToolServer.server_name,
    server_version: frontendToolServer.server_version,
    capabilities: frontendToolServer.capabilities,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Frontend tool transport request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    void promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

declare global {
  interface Window {
    __ACTION_FRONTEND_TOOLS__?: typeof frontendToolServer;
    __ACTION_FRONTEND_TOOLS_TRANSPORT__?: FrontendToolTransport;
  }
}

export function FrontendToolBridge() {
  useEffect(() => {
    window.__ACTION_FRONTEND_TOOLS__ = frontendToolServer;

    const handleRequest = async (message: FrontendToolBridgeRequest): Promise<FrontendToolBridgeResponse> => {
      if (message.kind === "get_status") {
        return {
          source: "action-frontend-tools-server",
          kind: "transport_status",
          request_id: message.request_id,
          ...transportMetadata(),
        };
      }

      if (message.kind === "list_tools") {
        return {
          source: "action-frontend-tools-server",
          kind: "tool_list",
          request_id: message.request_id,
          server_name: transportMetadata().server_name,
          server_version: transportMetadata().server_version,
          capabilities: transportMetadata().capabilities,
          tools: frontendToolServer.listTools(),
        };
      }

      const result = await frontendToolServer.invokeTool(message.tool_name, message.input);
      if (result.ok) {
        return {
          source: "action-frontend-tools-server",
          kind: "tool_result",
          request_id: message.request_id,
          output: result.output,
        };
      }

      return {
        source: "action-frontend-tools-server",
        kind: "tool_error",
        request_id: message.request_id,
        error: result.error,
      };
    };

    window.__ACTION_FRONTEND_TOOLS_TRANSPORT__ = {
      available: () => true,
      request: (message, options) => {
        const timeoutMs = options?.timeout_ms ?? DEFAULT_FRONTEND_TOOL_TRANSPORT_TIMEOUT_MS;
        return withTimeout(handleRequest(message), timeoutMs);
      },
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== "object") {
        return;
      }

      const message = data as Partial<FrontendToolBridgeRequest>;
      if (message.source !== FRONTEND_TOOL_CLIENT_SOURCE || typeof message.request_id !== "string") {
        return;
      }
      if (message.kind !== "get_status" && message.kind !== "list_tools" && message.kind !== "invoke_tool") {
        return;
      }
      if (message.kind === "invoke_tool" && typeof message.tool_name !== "string") {
        return;
      }

      void handleRequest(message as FrontendToolBridgeRequest).then((response) => {
        window.postMessage(response, window.location.origin);
      });
    };

    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("message", onMessage);
      delete window.__ACTION_FRONTEND_TOOLS__;
      delete window.__ACTION_FRONTEND_TOOLS_TRANSPORT__;
    };
  }, []);

  return null;
}
