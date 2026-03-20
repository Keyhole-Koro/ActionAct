import { useEffect, useState } from "react";
import { useUploadStore, type UploadTask } from "../store/useUploadStore";
import { useRunContextStore } from "@/features/context/store/run-context-store";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { useGraphStore } from "@/features/graph/store";
import {
    getResponseLanguagePreference,
    subscribeResponseLanguagePreference,
    type ResponseLanguage,
} from "@/lib/response-language-preference";

const phaseOrder = ['uploaded', 'extracting', 'atomizing', 'resolving_topic', 'updating_draft', 'completed'] as const;

const copy = {
    ja: {
        dockEyebrow: "Knowledge Upload",
        dockTitle: "ファイルをトピックノードに変換",
        dockCta: "「Add sources」を使う",
        dockDescription: "ファイルを追加すると、Action が内容を抽出し、既存トピックへ追加するか新規トピックを作るかを判定して、グラフを更新します。",
        formats: ['PDF', 'Markdown', 'Docs', 'Images', 'CSV', 'JSON'],
        phaseLabel: {
            uploaded: "受付完了",
            extracting: "本文を抽出中…",
            atomizing: "主張を分解中…",
            resolving_topic: "トピックを判定中…",
            updating_draft: "グラフを更新中…",
            completed: "完了",
            failed: "失敗",
        } satisfies Record<string, string>,
        resultExisting: "既存トピックに追加しました",
        resultNew: "新しいトピックを作成しました",
        hint: {
            uploaded: "ファイルを受け付け、知識化キューに入りました。",
            extracting: "ファイルを読み取り、使える本文を抽出しています。",
            atomizing: "内容を主張と根拠の単位に分解しています。",
            resolving_topic: "既存トピックに付けるか、新規トピックを作るかを判定しています。",
            updating_draft: "結果をワークスペースのグラフへ反映しています。",
        } as Partial<Record<UploadTask['status'], string>>,
        readyInGraph: "グラフに反映済み",
        failedFallback: "知識更新が完了する前にアップロード処理が失敗しました。",
        dismissLabel: "閉じる",
    },
    en: {
        dockEyebrow: "Knowledge Upload",
        dockTitle: "Turn files into topic nodes",
        dockCta: "Use “Add sources”",
        dockDescription: "Upload files, then Action extracts the content, decides whether it belongs in an existing topic or a new one, and updates the graph for you.",
        formats: ['PDF', 'Markdown', 'Docs', 'Images', 'CSV', 'JSON'],
        phaseLabel: {
            uploaded: "Upload received",
            extracting: "Extracting text…",
            atomizing: "Atomizing claims…",
            resolving_topic: "Finding the right topic…",
            updating_draft: "Updating graph…",
            completed: "Done",
            failed: "Failed",
        } satisfies Record<string, string>,
        resultExisting: "Added to existing topic",
        resultNew: "Created a new topic",
        hint: {
            uploaded: "We accepted the file and queued knowledge extraction.",
            extracting: "Reading the file and pulling out usable text.",
            atomizing: "Breaking the content into claims and evidence.",
            resolving_topic: "Deciding whether this belongs to an existing topic or a new one.",
            updating_draft: "Writing the result back into the workspace graph.",
        } as Partial<Record<UploadTask['status'], string>>,
        readyInGraph: "Ready in graph",
        failedFallback: "The upload failed before the knowledge update completed.",
        dismissLabel: "Dismiss",
    },
} as const;

function resolutionLabel(mode: string | undefined, language: ResponseLanguage) {
    if (mode === 'attach_existing') {
        return copy[language].resultExisting;
    }
    if (mode === 'create_new') {
        return copy[language].resultNew;
    }
    return null;
}

function processingHint(status: UploadTask['status'], language: ResponseLanguage) {
    return copy[language].hint[status] ?? null;
}

function stepTone(taskStatus: UploadTask['status'], step: typeof phaseOrder[number]) {
    if (taskStatus === 'failed') {
        return step === 'uploaded'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-slate-200 bg-white/70 text-slate-400';
    }

    const currentIndex = phaseOrder.indexOf(taskStatus === 'completed' ? 'completed' : taskStatus);
    const stepIndex = phaseOrder.indexOf(step);
    if (stepIndex < currentIndex) {
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }
    if (stepIndex === currentIndex) {
        return 'border-sky-200 bg-sky-50 text-sky-700';
    }
    return 'border-slate-200 bg-white/70 text-slate-400';
}

export function UploadStatusDock() {
    const [language, setLanguage] = useState<ResponseLanguage>("ja");

    useEffect(() => {
        setLanguage(getResponseLanguagePreference());
        return subscribeResponseLanguagePreference((nextLanguage) => {
            setLanguage(nextLanguage);
        });
    }, []);

    return (
        <div className="pointer-events-auto flex w-[min(30rem,calc(100vw-2rem))] flex-col gap-2 opacity-40 transition-opacity duration-200 hover:opacity-100">
            <div className="rounded-[22px] border border-slate-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.82),rgba(241,245,249,0.72))] p-4 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.35)] backdrop-blur-md transition-colors duration-200 hover:bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(241,245,249,0.92))]">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{copy[language].dockEyebrow}</div>
                        <h2 className="mt-1 text-sm font-semibold text-slate-900">{copy[language].dockTitle}</h2>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                        {copy[language].dockCta}
                    </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">
                    {copy[language].dockDescription}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {copy[language].formats.map((label) => (
                        <span key={label} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600">
                            {label}
                        </span>
                    ))}
                </div>
            </div>
            <UploadProgressList />
        </div>
    );
}

export function UploadProgressList() {
    const uploads = useUploadStore((state) => state.uploads);
    const { workspaceId } = useRunContextStore();
    const uploadTasks = Object.values(uploads)
        .filter((t) => t.workspaceId === workspaceId)
        .sort((left, right) => right.id.localeCompare(left.id));

    if (uploadTasks.length === 0) return null;

    return (
        <div className="pointer-events-auto flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200/50 hover:scrollbar-thumb-slate-300/50 transition-all">
            {uploadTasks.map((task) => (
                <UploadProgressCard key={task.id} task={task} />
            ))}
        </div>
    );
}

function UploadProgressCard({ task }: { task: UploadTask }) {
    const removeUpload = useUploadStore((state) => state.removeUpload);
    const persistedNodes = useGraphStore((state) => state.persistedNodes);
    const [language, setLanguage] = useState<ResponseLanguage>("ja");
    const { id, filename, status, progressPercentage, resolutionMode, resolvedTopicId, errorMessage } = task;

    const isDone = status === "completed";
    const isError = status === "failed";
    const isProcessing = !isDone && !isError;
    const resultLabel = resolutionLabel(resolutionMode, language);
    const hint = processingHint(status, language);
    const resolvedTopicTitle = resolvedTopicId
        ? persistedNodes.find((node) => node.id === resolvedTopicId)?.data?.label
        : null;

    useEffect(() => {
        setLanguage(getResponseLanguagePreference());
        return subscribeResponseLanguagePreference((nextLanguage) => {
            setLanguage(nextLanguage);
        });
    }, []);

    // On completion, focus the resolved node and auto-dismiss.
    useEffect(() => {
        if (!isDone || !resolvedTopicId) return;
        const timer = setTimeout(() => {
            window.dispatchEvent(new CustomEvent('action:focus-node', { detail: { nodeId: resolvedTopicId } }));
            removeUpload(id);
        }, 4500);
        return () => clearTimeout(timer);
    }, [isDone, resolvedTopicId, removeUpload, id]);

    return (
        <div className="animate-in slide-in-from-left-2 rounded-[20px] border border-slate-200/80 bg-background/95 px-3 py-3 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] backdrop-blur-sm">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                    {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-sky-600" />}
                    {isDone && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    {isError && <AlertCircle className="h-4 w-4 text-rose-600" />}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate text-xs font-semibold leading-none text-slate-900">{filename}</p>
                            <p className={cn(
                                "mt-1 text-[11px] leading-none",
                                isError ? "text-rose-700" : isDone ? "text-emerald-700" : "text-slate-500",
                            )}>
                                {isDone ? copy[language].readyInGraph : (copy[language].phaseLabel[status] ?? status)}
                            </p>
                        </div>
                        {(isDone || isError) && (
                            <button
                                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted/50"
                                onClick={() => removeUpload(id)}
                                aria-label={copy[language].dismissLabel}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {phaseOrder.map((step) => (
                            <span
                                key={step}
                                className={cn(
                                    "rounded-full border px-2 py-1 text-[10px] font-medium",
                                    stepTone(status, step),
                                )}
                            >
                                {copy[language].phaseLabel[step]}
                            </span>
                        ))}
                    </div>

                    {isProcessing && hint && (
                        <p className="mt-3 text-[11px] leading-5 text-slate-600">{hint}</p>
                    )}

                    {resultLabel && (
                        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800">
                            {resultLabel}
                            {resolvedTopicTitle
                                ? ` (${resolvedTopicTitle})`
                                : resolvedTopicId
                                    ? ` (${resolvedTopicId})`
                                    : ''}
                        </div>
                    )}

                    {isError && (
                        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-700">
                            {errorMessage ?? copy[language].failedFallback}
                        </div>
                    )}

                    {isProcessing ? (
                        <div className="mt-3">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className="h-full rounded-full bg-sky-500 transition-all duration-500 ease-out"
                                    style={{ width: `${progressPercentage}%` }}
                                />
                            </div>
                            <p className="mt-1 text-right text-[10px] text-slate-500">{progressPercentage}%</p>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
