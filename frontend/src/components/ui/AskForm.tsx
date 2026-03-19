"use client";

import React, { useRef, useState } from 'react';
import { Send, Plus, X, Loader2, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGraphStore } from '@/features/graph/store';
import { useActStream } from '@/features/action/actionAct/hooks/useActStream';
import { useStreamPreferencesStore } from '@/features/agentTools/store/stream-preferences-store';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { UploadButton } from '@/features/action/actionOrganize/components/UploadButton';

export function AskForm() {
    const { startStream } = useActStream();
    const { isStreaming } = useGraphStore();
    const { isReadOnly } = useRunContextStore();
    const [query, setQuery] = useState('');
    const [mediaFiles, setMediaFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    if (isReadOnly) return null;

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-10 pointer-events-none">
            <div className="space-y-2">
                <form
                    onSubmit={onSubmit}
                    className="pointer-events-auto relative flex flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_8px_30px_rgb(0,0,0,0.08)] backdrop-blur-md transition-all duration-300 focus-within:border-primary/30 focus-within:shadow-[0_8px_40px_rgb(0,0,0,0.12)]"
                >
                    {/* Media Previews */}
                    {mediaFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-4 pt-4">
                            {mediaFiles.map((file, i) => (
                                <div key={i} className="group relative flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-1.5 animate-in zoom-in-95 duration-200">
                                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white shadow-sm">
                                        <FileUp className="h-3 w-3 text-slate-400" />
                                    </div>
                                    <span className="max-w-[120px] truncate text-[11px] font-semibold text-slate-600">
                                        {file.name}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeFile(i)}
                                        className="ml-1 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-2 p-2">
                        {/* Hidden File Input */}
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            multiple
                            className="hidden"
                        />

                        {/* Plus / Add Menu */}
                        <div className="flex items-center gap-1 pl-1">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all active:scale-95"
                                title="Attach context files"
                            >
                                <Plus className="h-5 w-5" />
                            </button>
                            <div className="h-6 w-px bg-slate-100 mx-1" />
                        </div>

                        {/* Input Area */}
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={isStreaming ? "AI is processing..." : "Ask anything or describe an action..."}
                            disabled={isStreaming}
                            className="flex-1 bg-transparent px-2 py-3 text-[15px] font-medium text-slate-700 outline-none placeholder:text-slate-400 disabled:opacity-50"
                        />

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pr-1">
                            <UploadButton compact className="shrink-0" />
                            <button
                                type="submit"
                                disabled={(!query.trim() && mediaFiles.length === 0) || isStreaming}
                                className={[
                                    "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 active:scale-90",
                                    (query.trim() || mediaFiles.length > 0) && !isStreaming
                                        ? "bg-slate-900 text-white shadow-lg shadow-slate-200 hover:bg-slate-800"
                                        : "bg-slate-50 text-slate-300"
                                ].join(' ')}
                            >
                                {isStreaming ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    <Send className="h-4.5 w-4.5" />
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
