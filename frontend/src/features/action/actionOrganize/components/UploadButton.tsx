"use client";

import React, { useRef, useState, useCallback } from "react";
import { FileUp, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { organizeService } from "@/services/organize";
import { useRunContextStore } from "@/features/context/store/run-context-store";
import { useUploadStore } from "../store/useUploadStore";

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

                // Hand over progress tracking to the global store
                const topicId = `topic:${result.inputId}`;
                useUploadStore.getState().addUpload(workspaceId, topicId, result.inputId, file.name);

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
                className="relative group gap-2 overflow-hidden rounded-full shadow-md transition-all duration-300 hover:shadow-primary/25 hover:shadow-lg active:scale-95 bg-primary text-primary-foreground font-medium px-5 border-none"
                disabled={state === "uploading"}
                onClick={() => fileInputRef.current?.click()}
            >
                {/* Subtle shine effect on hover */}
                <div className="absolute inset-0 -translate-x-[150%] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 transition-transform duration-700 ease-out group-hover:translate-x-[150%]" />

                {state === "uploading" ? (
                    <Loader2 className="w-4 h-4 animate-spin relative" />
                ) : state === "done" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400 relative" />
                ) : (
                    <FileUp className="w-4 h-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110 relative" />
                )}

                <span className="relative">
                    {state === "uploading" ? "Uploading..." : state === "done" ? "Added!" : "Add Knowledge"}
                </span>
            </Button>
            {state === "error" && errorMsg && (
                <span className="text-xs text-destructive ml-2">{errorMsg}</span>
            )}
        </>
    );
}
