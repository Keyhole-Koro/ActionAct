"use client";

import React, { useRef, useState, useCallback } from "react";
import { FileUp, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { organizeService } from "@/services/organize";
import { useRunContextStore } from "@/features/context/store/run-context-store";
import { useUploadStore } from "../store/useUploadStore";
import { cn } from "@/lib/utils";
import { useAuthState } from "@/features/auth/hooks/useAuthState";

type UploadState = "idle" | "uploading" | "done" | "error";

type UploadButtonProps = {
    compact?: boolean;
    className?: string;
};

export function UploadButton({ compact = false, className }: UploadButtonProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [state, setState] = useState<UploadState>("idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const { workspaceId } = useRunContextStore();
    const { user, loading } = useAuthState();

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
                useUploadStore.getState().addUpload(workspaceId, result.topicId, result.inputId, file.name);

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
                type="button"
                className={cn(
                    "relative group gap-2 overflow-hidden transition-all duration-300 active:scale-95 border-none",
                    compact
                        ? "h-10 rounded-xl bg-foreground text-background px-3 shadow-sm hover:shadow-md"
                        : "rounded-full bg-primary text-primary-foreground px-5 shadow-md hover:shadow-primary/25 hover:shadow-lg font-medium",
                    className,
                )}
                    disabled={state === "uploading" || loading || !user}
                    onClick={() => {
                        if (!user) {
                            setErrorMsg("Sign in required before uploading files");
                            return;
                        }
                        fileInputRef.current?.click();
                    }}
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

                <span className={cn("relative", compact ? "text-sm font-medium" : "")}>
                    {state === "uploading"
                        ? "Uploading..."
                        : state === "done"
                            ? "Added!"
                            : !user
                                ? "Sign in to upload"
                                : compact
                                    ? "Upload"
                                    : "Add Knowledge"}
                </span>
            </Button>
            {state === "error" && errorMsg && (
                <span className="text-xs text-destructive ml-2">{errorMsg}</span>
            )}
        </>
    );
}
