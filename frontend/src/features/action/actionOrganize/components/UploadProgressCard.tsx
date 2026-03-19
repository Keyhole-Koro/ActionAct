import { useEffect } from "react";
import { useUploadStore, type UploadTask } from "../store/useUploadStore";
import { useRunContextStore } from "@/features/context/store/run-context-store";
import { Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";

const phaseLabel: Record<string, string> = {
    uploaded: "Queued",
    extracting: "Extracting text…",
    atomizing: "Atomizing claims…",
    updating_draft: "Updating draft…",
    completed: "Done",
    failed: "Failed",
};

export function UploadProgressList() {
    const uploads = useUploadStore((state) => state.uploads);
    const { workspaceId } = useRunContextStore();
    const uploadTasks = Object.values(uploads).filter((t) => t.workspaceId === workspaceId);

    if (uploadTasks.length === 0) return null;

    return (
        <div className="pointer-events-auto flex flex-col gap-1.5 max-h-[280px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200/50 hover:scrollbar-thumb-slate-300/50 transition-all">
            {uploadTasks.map((task) => (
                <UploadProgressCard key={task.id} task={task} />
            ))}
        </div>
    );
}

function UploadProgressCard({ task }: { task: UploadTask }) {
    const removeUpload = useUploadStore((state) => state.removeUpload);
    const { id, filename, status, progressPercentage, resolvedTopicId } = task;

    const isDone = status === "completed";
    const isError = status === "failed";
    const isProcessing = !isDone && !isError;

    // On completion, focus the resolved node and auto-dismiss.
    useEffect(() => {
        if (!isDone || !resolvedTopicId) return;
        const timer = setTimeout(() => {
            window.dispatchEvent(new CustomEvent('action:focus-node', { detail: { nodeId: resolvedTopicId } }));
            removeUpload(id);
        }, 600);
        return () => clearTimeout(timer);
    }, [isDone, resolvedTopicId, removeUpload, id]);

    return (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/90 backdrop-blur-sm px-2.5 py-1.5 shadow-sm w-56 animate-in slide-in-from-left-2">
            {/* status icon */}
            <div className="shrink-0">
                {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                {isError && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
            </div>

            {/* text */}
            <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium text-foreground leading-none mb-0.5">{filename}</p>
                <p className={`text-[10px] leading-none ${isError ? "text-destructive" : isDone ? "text-green-600" : "text-muted-foreground"}`}>
                    {isDone ? "Opening…" : (phaseLabel[status] ?? status)}
                </p>
            </div>

            {/* dismiss button (error) or progress bar (in-progress) */}
            {isError ? (
                <button
                    className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground cursor-pointer"
                    onClick={() => removeUpload(id)}
                    aria-label="Dismiss"
                >
                    <X className="w-3 h-3" />
                </button>
            ) : isProcessing ? (
                <div className="w-10 shrink-0">
                    <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-500 ease-out bg-primary"
                            style={{ width: `${progressPercentage}%` }}
                        />
                    </div>
                    <p className="text-[9px] text-muted-foreground text-right mt-0.5">{progressPercentage}%</p>
                </div>
            ) : null}
        </div>
    );
}
