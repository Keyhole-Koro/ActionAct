"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, SendHorizonal } from 'lucide-react';
import { useActStream } from '@/features/action/actionAct/hooks/useActStream';
import { UploadButton } from '@/features/action/actionOrganize/components/UploadButton';

export function AskForm() {
    const [query, setQuery] = useState('');
    const {
        isStreaming,
        startStream,
        clarification,
        hasSelectedNodes,
        clearClarification,
        continueWithoutContext,
        retryWithSelection,
    } = useActStream();

    const onSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!query.trim() || isStreaming) return;

        void startStream(null, query);
        setQuery('');
    };

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-10 pointer-events-none">
            <div className="space-y-2">
                {clarification ? (
                    <div className="pointer-events-auto rounded-2xl border border-amber-300/60 bg-background/96 p-3 shadow-lg backdrop-blur-sm">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground">More context is needed</p>
                                <p className="mt-1 text-sm text-muted-foreground">{clarification.message}</p>
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
                                Use selected node and retry
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
                    onSubmit={onSubmit}
                    className="pointer-events-auto bg-background/95 border shadow-lg rounded-2xl p-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 transition-shadow backdrop-blur-sm"
                >
                    <UploadButton compact className="shrink-0" />
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
                        disabled={!query.trim() || isStreaming}
                    >
                        {isStreaming ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <SendHorizonal className="h-4 w-4" />
                        )}
                    </Button>
                </form>
            </div>
        </div>
    );
}
