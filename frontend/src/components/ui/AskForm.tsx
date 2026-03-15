"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SendHorizonal, Loader2 } from 'lucide-react';
import { useActStream } from '@/features/action/actionAct/hooks/useActStream';
import { UploadButton } from '@/features/action/actionOrganize/components/UploadButton';

export function AskForm() {
    const [query, setQuery] = useState('');
    const { isStreaming, startStream } = useActStream();

    const onSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!query.trim() || isStreaming) return;

        startStream(null, query);
        setQuery(''); // clear after submit
    };

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-10 pointer-events-none">
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
    );
}
