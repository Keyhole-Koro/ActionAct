import { useUploadStore } from "../store/useUploadStore";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FileText, CheckCircle2, AlertCircle } from "lucide-react";

export function UploadProgressList() {
    const uploads = useUploadStore((state) => state.uploads);
    const uploadTasks = Object.values(uploads);

    if (uploadTasks.length === 0) return null;

    return (
        <div className="absolute bottom-4 right-4 z-50 flex flex-col gap-2">
            {uploadTasks.map((task) => (
                <UploadProgressCard key={task.id} task={task} />
            ))}
        </div>
    );
}

function UploadProgressCard({ task }: { task: ReturnType<typeof useUploadStore.getState>["uploads"]["string"] }) {
    const { filename, status, progressPercentage } = task;

    const isDone = status === "completed";
    const isError = status === "failed";
    const isProcessing = !isDone && !isError;

    const displayStatus = {
        uploaded: "Uploaded",
        extracting: "Extracting Text",
        atomizing: "Atomizing Claims",
        resolving_topic: "Resolving Topic",
        updating_draft: "Updating Draft",
        completed: "Processing Complete",
        failed: "Processing Failed",
    }[status];

    return (
        <Card className="w-72 shadow-lg border-muted/20 backdrop-blur-sm bg-background/90 overflow-hidden animate-in slide-in-from-bottom-5">
            <CardContent className="p-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0">
                        {isProcessing && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                        {isDone && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                        {isError && <AlertCircle className="w-5 h-5 text-destructive" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 text-sm font-medium truncate">
                            <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{filename}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-muted-foreground mb-1.5">
                            <span>{displayStatus}</span>
                            <span>{progressPercentage}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-500 ease-out ${isError ? 'bg-destructive' : isDone ? 'bg-green-500' : 'bg-primary'}`}
                                style={{ width: `${progressPercentage}%` }}
                            />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
