"use client";

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useGraphStore } from '@/features/graph/store';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { config } from '@/lib/config';
import { getFirebaseIdToken } from '@/services/firebase/token';

export function FilePreviewPanel() {
    const { previewInputId, previewWorkspaceId, setFilePreview } = useGraphStore();
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<{ filename: string; contentType: string } | null>(null);

    useEffect(() => {
        if (!previewInputId || !previewWorkspaceId) {
            setContent(null);
            setMetadata(null);
            return;
        }

        let aborted = false;
        const loadFile = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = await getFirebaseIdToken();
                const res = await fetch(
                    `${config.actApiBaseUrl}/api/workspaces/${previewWorkspaceId}/inputs/${previewInputId}/raw`,
                    {
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                    }
                );

                if (!res.ok) throw new Error(`Failed to load file: ${res.statusText}`);

                const contentType = res.headers.get('Content-Type') || 'text/plain';
                const contentDisposition = res.headers.get('Content-Disposition') || '';
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                const filename = filenameMatch ? filenameMatch[1] : 'file';

                setMetadata({ filename, contentType });

                if (contentType.startsWith('text/') || contentType === 'application/json' || filename.endsWith('.md')) {
                    const text = await res.text();
                    if (!aborted) setContent(text);
                } else {
                    if (!aborted) setContent('Preview not available for binary files. Please download to view.');
                }
            } catch (err) {
                if (!aborted) setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                if (!aborted) setLoading(false);
            }
        };

        void loadFile();
        return () => { aborted = true; };
    }, [previewInputId, previewWorkspaceId]);

    if (!previewInputId) return null;

    const isMarkdown = metadata?.filename.endsWith('.md') || metadata?.contentType === 'text/markdown';

    return (
        <div className="absolute inset-y-0 right-0 z-50 w-[500px] border-l border-slate-200 bg-white shadow-2xl transition-transform animate-in slide-in-from-right duration-300">
            <div className="flex h-full flex-col">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/50">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">File Preview</p>
                        <h3 className="truncate text-sm font-semibold text-slate-700" title={metadata?.filename}>
                            {metadata?.filename || 'Loading...'}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {previewInputId && previewWorkspaceId && (
                            <a
                                href={`${config.actApiBaseUrl}/api/workspaces/${previewWorkspaceId}/inputs/${previewInputId}/raw`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                Open Raw
                            </a>
                        )}
                        <button
                            onClick={() => setFilePreview(null, null)}
                            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                    {loading ? (
                        <div className="flex h-full items-center justify-center">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                    ) : error ? (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                            <p className="font-semibold">Error</p>
                            <p className="mt-1">{error}</p>
                        </div>
                    ) : (
                        <div className="prose prose-slate prose-sm max-w-none">
                            {isMarkdown ? (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {content || ''}
                                </ReactMarkdown>
                            ) : (
                                <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-[12px] leading-relaxed text-slate-700 border border-slate-100">
                                    {content}
                                </pre>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
