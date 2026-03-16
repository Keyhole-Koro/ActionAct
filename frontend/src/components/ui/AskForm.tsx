"use client";

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, SendHorizonal, Plus, X, File as FileIcon, Image as ImageIcon } from 'lucide-react';
import { useActStream } from '@/features/action/actionAct/hooks/useActStream';
import { UploadButton } from '@/features/action/actionOrganize/components/UploadButton';

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
