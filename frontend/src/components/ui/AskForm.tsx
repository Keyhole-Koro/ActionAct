"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SendHorizonal, Loader2, Globe, Sparkles } from 'lucide-react';
import { useActStream } from '@/features/action/actionAct/hooks/useActStream';
import { useStreamPreferencesStore } from '@/features/agentTools/store/stream-preferences-store';
import { UploadButton } from '@/features/action/actionOrganize/components/UploadButton';
import { cn } from '@/lib/utils';

export function AskForm() {
    const [query, setQuery] = useState('');
    const { useWebGrounding, setPreferences } = useStreamPreferencesStore();
    const { isStreaming, startStream } = useActStream();

    const onSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!query.trim() || isStreaming) return;

        startStream(null, query, { enableGrounding: useWebGrounding });
        setQuery(''); // clear after submit
    };

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-10 pointer-events-none">
            <form
                onSubmit={onSubmit}
                className="pointer-events-auto bg-background/95 border shadow-lg rounded-2xl p-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 transition-shadow backdrop-blur-sm"
            >
                <UploadButton compact className="shrink-0" />
                <button
                    type="button"
                    onClick={() => setPreferences({ useWebGrounding: !useWebGrounding })}
                    disabled={isStreaming}
                    aria-pressed={useWebGrounding}
                    className={cn(
                        'group shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-all duration-200',
                        'flex items-center gap-2 shadow-sm',
                        useWebGrounding
                            ? 'border-sky-300 bg-linear-to-r from-sky-500/15 via-cyan-500/10 to-transparent text-sky-700'
                            : 'border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted/70',
                        isStreaming ? 'opacity-60 cursor-not-allowed' : 'hover:border-sky-300/80',
                    )}
                >
                    <span
                        className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-lg transition-colors',
                            useWebGrounding ? 'bg-sky-500 text-white' : 'bg-background text-muted-foreground',
                        )}
                    >
                        {useWebGrounding ? <Sparkles className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                    </span>
                    <span>Web</span>
                </button>
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
    );
}
