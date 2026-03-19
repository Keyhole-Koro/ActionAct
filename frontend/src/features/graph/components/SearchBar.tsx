"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Zap, FileText, Brain, MessageSquare } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useGraphStore } from '@/features/graph/store';
import { truncate } from '@/lib/string';
import { CAMERA_CONFIG } from '@/services/camera/cameraService';

export function SearchBar() {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);
    const { persistedNodes, actNodes, expandNode, expandBranchNode, setSelectedNodes, setActiveNode } = useGraphStore();
    const reactFlowInstance = useReactFlow();

    // ── Search Logic ──────────────────────────────────────────────────────────
    const allNodes = useMemo(() => [...persistedNodes, ...actNodes], [persistedNodes, actNodes]);

    const results = useMemo(() => {
        if (!query.trim()) return [];
        const q = query.toLowerCase();
        return allNodes
            .filter((node) => {
                const data = node.data as any;
                const label = (data.label || '').toLowerCase();
                const content = (data.contentMd || '').toLowerCase();
                const summary = (data.contextSummary || '').toLowerCase();
                return label.includes(q) || content.includes(q) || summary.includes(q);
            })
            .slice(0, 8); // Limit results for UI clarity
    }, [allNodes, query]);

    // ── Keyboard Shortcuts & Events ──────────────────────────────────────────
    useEffect(() => {
        const handleOpenSearch = () => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 10);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                handleOpenSearch();
            } else if (e.key === '/') {
                const target = e.target as HTMLElement;
                if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
                    e.preventDefault();
                    handleOpenSearch();
                }
            } else if (e.key === 'Escape') {
                setIsOpen(false);
                setQuery('');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('action:open-search', handleOpenSearch);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('action:open-search', handleOpenSearch);
        };
    }, []);

    const handleJumpToNode = (nodeId: string) => {
        const node = allNodes.find((n) => n.id === nodeId);
        if (!node) return;

        // Visual feedback & expansion
        expandNode(nodeId);
        expandBranchNode(nodeId);
        setSelectedNodes([nodeId]);
        setActiveNode(nodeId);

        // Smooth camera movement
        reactFlowInstance.setCenter(
            node.position.x + CAMERA_CONFIG.nodeOffsetX,
            node.position.y + CAMERA_CONFIG.nodeOffsetY,
            { duration: 800, zoom: 1.0 }
        );

        setIsOpen(false);
        setQuery('');
    };

    const handleKeyDownInInput = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && results[activeIndex]) {
            handleJumpToNode(results[activeIndex].id);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute left-1/2 top-20 z-50 w-full max-w-xl -translate-x-1/2 px-4 animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-2xl backdrop-blur-xl ring-1 ring-black/5">
                {/* Input Area */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                    <Search className="h-5 w-5 text-slate-400" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search nodes (title or content)..."
                        className="flex-1 bg-transparent text-sm font-medium outline-none text-slate-700 placeholder:text-slate-400"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setActiveIndex(0);
                        }}
                        onKeyDown={handleKeyDownInInput}
                    />
                    <div className="flex items-center gap-1.5">
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">ESC</span>
                        <button 
                            onClick={() => { setIsOpen(false); setQuery(''); }}
                            className="rounded-full p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Results Area */}
                {results.length > 0 ? (
                    <div ref={resultsRef} className="max-h-[400px] overflow-y-auto p-2">
                        {results.map((node, index) => {
                            const data = node.data as any;
                            const kind = data.kind || 'atom';
                            const isActive = index === activeIndex;

                            return (
                                <button
                                    key={node.id}
                                    onClick={() => handleJumpToNode(node.id)}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    className={[
                                        'flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition-all',
                                        isActive ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-slate-50'
                                    ].join(' ')}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {kind === 'topic' ? <Zap className="h-3.5 w-3.5 text-amber-500" /> : 
                                             kind === 'act' ? <Brain className="h-3.5 w-3.5 text-indigo-500" /> :
                                             kind === 'input' ? <FileText className="h-3.5 w-3.5 text-emerald-500" /> :
                                             <MessageSquare className="h-3.5 w-3.5 text-slate-400" />}
                                            <span className="truncate text-sm font-bold text-slate-700">{data.label}</span>
                                        </div>
                                        <span className={[
                                            'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                                            kind === 'topic' ? 'bg-amber-100 text-amber-700' :
                                            kind === 'act' ? 'bg-indigo-100 text-indigo-700' :
                                            'bg-slate-100 text-slate-500'
                                        ].join(' ')}>{kind}</span>
                                    </div>
                                    <p className="line-clamp-1 text-[11px] text-slate-500 leading-relaxed">
                                        {data.contextSummary || data.contentMd || 'No description available'}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                ) : query.trim() ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                        <Search className="mb-2 h-8 w-8 opacity-20" />
                        <p className="text-sm font-medium">No matches found for "{query}"</p>
                    </div>
                ) : (
                    <div className="px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Hints</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                <span className="h-1 w-1 rounded-full bg-slate-300" />
                                Type to filter visible nodes
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                <span className="h-1 w-1 rounded-full bg-slate-300" />
                                Use Arrow keys to navigate
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
