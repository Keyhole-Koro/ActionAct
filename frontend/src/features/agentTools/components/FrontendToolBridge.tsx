"use client";

import { useEffect } from "react";

import { frontendToolServer } from "@/features/agentTools/runtime/frontend-tool-registry";

declare global {
  interface Window {
    __ACTION_FRONTEND_TOOLS__?: typeof frontendToolServer;
  }
}

export function FrontendToolBridge() {
  useEffect(() => {
    window.__ACTION_FRONTEND_TOOLS__ = frontendToolServer;
    return () => {
      delete window.__ACTION_FRONTEND_TOOLS__;
    };
  }, []);

  return null;
}
