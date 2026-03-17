"use client";

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, SendHorizonal, Plus, X, File as FileIcon, Image as ImageIcon } from 'lucide-react';
import { useActStream } from '@/features/action/actionAct/hooks/useActStream';
import { UploadButton } from '@/features/action/actionOrganize/components/UploadButton';
import { MarkdownPane } from '@/features/nodeMarkdown/components/MarkdownPane';
import { useActClarificationStore } from '@/features/agentTools/store/act-clarification-store';
import { useGraphStore } from '@/features/graph/store';
import type { ActRunClarification } from '@/features/agentTools/runtime/frontend-tool-orchestrator';

const IS_DEV = process.env.NODE_ENV !== 'production';

function buildQaClarification(
    scenario: 'node' | 'intent' | 'detail',
    contextNodeIds: string[],
): ActRunClarification {
    if (scenario === 'intent') {
        return {
            code: 'MISSING_UI_CONTEXT',
            message: 'QA: intent clarification',
            message_md: [
                'QAモードで intent clarification を強制表示しています。',
                '',
                '### Follow-up',
                '候補から知りたい観点を1つ選んでください。',
            ].join('\n'),
            suggested_action: 'select_node',
            candidate_options: [
                {
                    option_id: 'qa-intent-overview',
                    label: 'まず全体像をつかみたい',
                    reason: '背景と要点を短く整理します。',
                    kind: 'intent',
                    query_hint: '全体像と要点',
                    context_node_ids: contextNodeIds,
                },
                {
                    option_id: 'qa-intent-deepdive',
                    label: '論点ごとに深掘りしたい',
                    reason: '重要論点を分けて具体的に見ます。',
                    kind: 'intent',
                    query_hint: '主要な論点を深掘り',
                    context_node_ids: contextNodeIds,
                },
            ],
        };
    }

    if (scenario === 'detail') {
        return {
            code: 'MISSING_UI_CONTEXT',
            message: 'QA: detail clarification',
            message_md: [
                'QAモードで detail clarification を強制表示しています。',
                '',
                '### Follow-up',
                '候補から進め方を1つ選んでください。',
            ].join('\n'),
            suggested_action: 'retry_without_context',
            candidate_options: [
                {
                    option_id: 'qa-detail-summary',
                    label: 'まず全体像をつかみたい',
                    reason: '背景と要点を短く整理します。',
                    kind: 'intent',
                    query_hint: '全体像と要点',
                    context_node_ids: contextNodeIds,
                },
                {
                    option_id: 'qa-detail-next-actions',
                    label: '次のアクションを決めたい',
                    reason: '実行順にアクションへ落とし込みます。',
                    kind: 'intent',
                    query_hint: '次のアクションを提案',
                    context_node_ids: contextNodeIds,
                },
            ],
        };
    }

    const firstNodeId = contextNodeIds[0] ?? 'qa-node-1';
    const secondNodeId = contextNodeIds[1] ?? 'qa-node-2';
    return {
        code: 'MISSING_UI_CONTEXT',
        message: 'QA: node clarification',
        message_md: [
            'QAモードで node clarification を強制表示しています。',
            '',
            '### Follow-up',
            '候補から対象ノードを1つ選んでください。',
        ].join('\n'),
        suggested_action: 'select_node',
        candidate_options: [
            {
                option_id: firstNodeId,
                label: '候補ノード A',
                reason: 'UI選択テスト用の候補です。',
                kind: 'node',
                node_id: firstNodeId,
            },
            {
                option_id: secondNodeId,
                label: '候補ノード B',
                reason: 'UI選択テスト用の候補です。',
                kind: 'node',
                node_id: secondNodeId,
            },
        ],
    };
}

export function AskForm() {
    const [query, setQuery] = useState('');
    const [mediaFiles, setMediaFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const {
        isStreaming,
        startStream,
        clarification,
        hasSelectedNodes,
        clearClarification,
        continueWithoutContext,
        retryWithSelection,
    } = useActStream();
    const setPendingClarification = useActClarificationStore((state) => state.setPendingClarification);
    const selectedNodeIds = useGraphStore((state) => state.selectedNodeIds);
    const actNodes = useGraphStore((state) => state.actNodes);
    const persistedNodes = useGraphStore((state) => state.persistedNodes);

    const triggerQaClarification = async (scenario: 'node' | 'intent' | 'detail') => {
        if (isStreaming) {
            return;
        }

        const contextNodeIds = [
            ...selectedNodeIds,
            ...actNodes.slice(0, 2).map((node) => node.id),
            ...persistedNodes.slice(0, 2).map((node) => node.id),
        ].filter((value, index, array) => value && array.indexOf(value) === index);

        const clarificationPayload = buildQaClarification(scenario, contextNodeIds);
        await setPendingClarification({
            clarification: clarificationPayload,
            pendingRun: {
                targetNodeId: null,
                query: scenario === 'intent' ? 'これについて教えて' : 'この内容を進めて',
                options: {
                    contextNodeIds,
                },
            },
        });
    };

    const onSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!query.trim() && mediaFiles.length === 0) || isStreaming) return;

        const userMedia = await Promise.all(
            mediaFiles.map(async (file) => {
                const buffer = await file.arrayBuffer();
                return {
                    mimeType: file.type || 'application/octet-stream',
                    data: new Uint8Array(buffer),
                };
            })
        );

        void startStream(null, query, { userMedia });
        setQuery('');
        setMediaFiles([]);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setMediaFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeFile = (index: number) => {
        setMediaFiles((prev) => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-10 pointer-events-none">
            <div className="space-y-2">
                {IS_DEV ? (
                    <div className="pointer-events-auto rounded-xl border border-dashed border-border/70 bg-background/90 px-3 py-2">
                        <p className="text-[11px] font-medium text-muted-foreground">QA Triggers (dev only)</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => void triggerQaClarification('node')} disabled={isStreaming}>
                                Trigger Node
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => void triggerQaClarification('intent')} disabled={isStreaming}>
                                Trigger Intent
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => void triggerQaClarification('detail')} disabled={isStreaming}>
                                Trigger Detail
                            </Button>
                        </div>
                    </div>
                ) : null}
                {clarification ? (
                    <div className="pointer-events-auto rounded-2xl border border-amber-300/60 bg-background/96 p-3 shadow-lg backdrop-blur-sm">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground">More context is needed</p>
                                {clarification.message_md ? (
                                    <MarkdownPane
                                        content={clarification.message_md}
                                        className="mt-1 prose prose-sm max-w-none text-muted-foreground prose-headings:my-1 prose-headings:text-foreground prose-p:my-1 prose-ul:my-1 prose-li:my-0"
                                    />
                                ) : (
                                    <p className="mt-1 text-sm text-muted-foreground">{clarification.message}</p>
                                )}
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="rounded-xl"
                                onClick={continueWithoutContext}
                                disabled={isStreaming}
                            >
                                Continue without context
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                className="rounded-xl"
                                onClick={() => void retryWithSelection()}
                                disabled={!hasSelectedNodes || isStreaming}
                            >
                                Use selection and retry
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="rounded-xl"
                                onClick={clearClarification}
                                disabled={isStreaming}
                            >
                                Dismiss
                            </Button>
                        </div>
                    </div>
                ) : null}
                <form
                    onSubmit={(e) => void onSubmit(e)}
                    className="pointer-events-auto bg-background/95 border shadow-lg rounded-2xl p-2 flex flex-col gap-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 transition-shadow backdrop-blur-sm"
                >
                    {mediaFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-2 pt-2">
                            {mediaFiles.map((file, i) => (
                                <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-lg pl-2 pr-1 py-1 text-xs">
                                    {file.type.startsWith('image/') ? <ImageIcon className="h-3 w-3" /> : <FileIcon className="h-3 w-3" />}
                                    <span className="truncate max-w-[150px]">{file.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeFile(i)}
                                        className="text-muted-foreground hover:text-foreground rounded-full hover:bg-muted p-0.5"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                            <UploadButton compact className="shrink-0" />
                            <div className="h-6 border-l" />
                            <input
                                type="file"
                                multiple
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleFileSelect}
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="rounded-xl h-10 w-10 shrink-0"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Ask a question or provide context..."
                            className="min-w-0 flex-1 bg-transparent border-none focus:outline-none px-3 text-sm"
                            disabled={isStreaming}
                        />
                        <Button
                            type="submit"
                            size="icon"
                            className="rounded-xl h-10 w-10 shrink-0"
                            disabled={(!query.trim() && mediaFiles.length === 0) || isStreaming}
                        >
                            {isStreaming ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <SendHorizonal className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
