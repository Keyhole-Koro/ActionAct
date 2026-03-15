"use client";

import { createPostMessageFrontendToolClient } from "@/features/agentTools/runtime/frontend-tool-transport";
import { frontendToolServer } from "@/features/agentTools/runtime/frontend-tool-registry";

export type FrontendToolInvokeResult = Awaited<ReturnType<typeof frontendToolServer.invokeTool>>;
export type FrontendToolDescriptor = ReturnType<typeof frontendToolServer.listTools>[number];

export type FrontendToolClient = {
  available: () => Promise<boolean> | boolean;
  listTools: () => Promise<FrontendToolDescriptor[]> | FrontendToolDescriptor[];
  invokeTool: (name: string, input: unknown) => Promise<FrontendToolInvokeResult> | FrontendToolInvokeResult;
};

export function createDirectFrontendToolClient(): FrontendToolClient {
  return {
    available: () => true,
    listTools: () => frontendToolServer.listTools(),
    invokeTool: (name: string, input: unknown) => frontendToolServer.invokeTool(name, input),
  };
}

export function createBrowserBridgeFrontendToolClient(
  targetWindow: Window = window,
  targetOrigin: string = window.location.origin,
): FrontendToolClient {
  const transportClient = createPostMessageFrontendToolClient(targetWindow, targetOrigin);

  return {
    available: async () => {
      try {
        const status = await transportClient.getStatus();
        return status.kind === "transport_status" ? status.available : false;
      } catch {
        return false;
      }
    },
    listTools: async () => {
      const response = await transportClient.listTools();
      if (response.kind !== "tool_list") {
        return [];
      }
      return response.tools as FrontendToolDescriptor[];
    },
    invokeTool: async (name: string, input: unknown) => {
      const response = await transportClient.invokeTool(name, input);
      if (response.kind === "tool_result") {
        return {
          ok: true as const,
          output: response.output as Record<string, unknown>,
        };
      }
      if (response.kind !== "tool_error") {
        return {
          ok: false as const,
          error: {
            code: "UNAVAILABLE",
            message: `Unexpected frontend tool transport response: ${response.kind}`,
            retryable: false,
          },
        };
      }
      return {
        ok: false as const,
        error: response.error as FrontendToolInvokeResult extends { ok: false; error: infer T } ? T : never,
      };
    },
  };
}
