"use client";

import React, { useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SendHorizonal, Loader2 } from 'lucide-react';
import { useActStream } from '@/features/action/actionAct/hooks/useActStream';
import { useRunContextStore } from '@/features/context/store/run-context-store';

export function AskForm() {
    const [query, setQuery] = useState('');
    const [enableGrounding, setEnableGrounding] = useState(false);
    const { workspaceId, topicId, setContext } = useRunContextStore();
    const workspaceInputRef = useRef<HTMLInputElement>(null);
    const topicInputRef = useRef<HTMLInputElement>(null);
    const { isStreaming, startStream } = useActStream();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const applyRunContext = () => {
        const nextWorkspaceId = workspaceInputRef.current?.value.trim() || workspaceId;
        const nextTopicId = topicInputRef.current?.value.trim() || topicId;

        setContext(nextWorkspaceId, nextTopicId);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('run_context.workspaceId', nextWorkspaceId);
            window.localStorage.setItem('run_context.topicId', nextTopicId);
        }

        const params = new URLSearchParams(searchParams.toString());
        params.set('workspaceId', nextWorkspaceId);
        params.set('topicId', nextTopicId);
        router.replace(`${pathname}?${params.toString()}`);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim() || isStreaming) return;
        startStream(query, { enableGrounding });
        setQuery(''); // clear after submit
    };

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-10">
            <div className="mb-2 rounded-xl border bg-background/90 p-2 shadow-sm backdrop-blur-sm">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                        key={`workspace-${workspaceId}`}
                        defaultValue={workspaceId}
                        ref={workspaceInputRef}
                        onBlur={applyRunContext}
                        placeholder="workspaceId"
                        className="h-8"
                        disabled={isStreaming}
                    />
                    <Input
                        key={`topic-${topicId}`}
                        defaultValue={topicId}
                        ref={topicInputRef}
                        onBlur={applyRunContext}
                        placeholder="topicId"
                        className="h-8"
                        disabled={isStreaming}
                    />
                    <Button type="button" variant="secondary" className="h-8 px-3" onClick={applyRunContext} disabled={isStreaming}>
                        Set Context
                    </Button>
                </div>
            </div>
            <form
                onSubmit={handleSubmit}
                className="bg-background border shadow-lg rounded-2xl p-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 transition-shadow"
            >
                <label className="flex items-center gap-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
                    <input
                        type="checkbox"
                        checked={enableGrounding}
                        onChange={(e) => setEnableGrounding(e.target.checked)}
                        disabled={isStreaming}
                    />
                    Web
                </label>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask a question or provide context..."
                    className="flex-1 bg-transparent border-none focus:outline-none px-4 text-sm"
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
    );
}
