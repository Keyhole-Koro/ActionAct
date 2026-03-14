"use client";

import React, { useRef, useState, useCallback } from "react";
import { Upload, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { organizeService } from "@/services/organize";
import { useRunContextStore } from "@/features/context/store/run-context-store";

type UploadState = "idle" | "uploading" | "done" | "error";

export function UploadButton() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [state, setState] = useState<UploadState>("idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const { workspaceId } = useRunContextStore();

    const handleFileChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;

            setState("uploading");
            setErrorMsg(null);

            try {
                const result = await organizeService.uploadInput(workspaceId, file);
                console.info("[Upload] Success:", result.inputId);
                setState("done");

                // Reset back to idle after a brief success indication
                setTimeout(() => setState("idle"), 2000);
            } catch (err) {
                console.error("[Upload] Failed:", err);
                setErrorMsg(err instanceof Error ? err.message : "Upload failed");
                setState("error");
                setTimeout(() => setState("idle"), 3000);
            } finally {
                // Reset file input so re-selecting same file triggers onChange
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            }
        },
        [workspaceId],
    );

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => void handleFileChange(e)}
                accept=".txt,.md,.pdf,.html,.csv,.json,.doc,.docx,.png,.jpg,.jpeg,.webp"
            />
            <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={state === "uploading"}
                onClick={() => fileInputRef.current?.click()}
            >
                {state === "uploading" && <Loader2 className="w-4 h-4 animate-spin" />}
                {state === "done" && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                {(state === "idle" || state === "error") && <Upload className="w-4 h-4" />}
                <span>
                    {state === "uploading" ? "Uploading…" : state === "done" ? "Uploaded" : "Upload"}
                </span>
            </Button>
            {state === "error" && errorMsg && (
                <span className="text-xs text-destructive ml-2">{errorMsg}</span>
            )}
        </>
    );
}
