"use client";

import { useEffect, useRef } from "react";
import { presenceService } from "@/services/presence/firestore";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function usePresence(
  workspaceId: string,
  uid: string | undefined,
  displayName: string | null | undefined,
  photoURL: string | null | undefined,
) {
  const removeRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!workspaceId || !uid) return;

    const write = () =>
      presenceService.writePresence(
        workspaceId,
        uid,
        displayName ?? null,
        photoURL ?? null,
      ).catch(() => {
        // presenceの書き込み失敗は無視
      });

    const remove = () =>
      presenceService.removePresence(workspaceId, uid).catch(() => {});

    removeRef.current = remove;

    void write();
    const timer = setInterval(() => void write(), HEARTBEAT_INTERVAL_MS);

    const handleBeforeUnload = () => {
      // sendBeacon でも良いが、Firestore deleteはfetch
      // cleanup は useEffect return で行う
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void remove();
    };
  }, [workspaceId, uid, displayName, photoURL]);
}
