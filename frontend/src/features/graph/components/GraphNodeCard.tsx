"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps, useUpdateNodeInternals } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    Play,
    RotateCcw,
    ChevronRight,
    ChevronDown,
    Bot,
    UserRound,
    FileUp,
    Loader2,
    Code,
    FileText,
    ExternalLink,
    Wrench,
    Network,
    Globe,
} from 'lucide-react';
import type { GraphNodeRender } from '@/features/graph/types';
import { useStreamPreferencesStore } from '@/features/agentTools/store/stream-preferences-store';
import {
    GRAPH_NODE_EXPANDED_MAX_HEIGHT,
    GRAPH_NODE_EXPANDED_WIDTH,
    GRAPH_ACT_NODE_EXPANED_MAX_HEIGHT,
    GRAPH_ACT_NODE_EXPANDED_WIDTH,
    ACT_NODE_COMPACT_WIDTH,
    NODE_COLLAPSED_BASE_WIDTH,
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '../constants/nodeDimensions';

const actTypeConfig: Record<string, { bar: string; dot: string; accent: string; ring: string; ringActive: string; ringDescendant: string; bgTint: string; topGrad: string }> = {
    explore:     { bar: 'bg-blue-500',    dot: 'bg-blue-500',    accent: 'text-blue-600',    ring: 'ring-blue-500/35',    ringActive: 'ring-blue-500/80',    ringDescendant: 'ring-blue-400/50',    bgTint: 'bg-blue-50/50',    topGrad: 'from-blue-400 via-sky-300 to-blue-400' },
    investigate: { bar: 'bg-emerald-500', dot: 'bg-emerald-500', accent: 'text-emerald-600', ring: 'ring-emerald-500/35', ringActive: 'ring-emerald-500/80', ringDescendant: 'ring-emerald-400/50', bgTint: 'bg-emerald-50/50', topGrad: 'from-emerald-400 via-teal-300 to-emerald-400' },
    consult:     { bar: 'bg-amber-500',   dot: 'bg-amber-500',   accent: 'text-amber-600',   ring: 'ring-amber-500/35',   ringActive: 'ring-amber-500/80',   ringDescendant: 'ring-amber-400/50',   bgTint: 'bg-amber-50/50',   topGrad: 'from-amber-400 via-yellow-300 to-amber-400' },
    act:         { bar: 'bg-violet-500',  dot: 'bg-violet-500',  accent: 'text-violet-600',  ring: 'ring-violet-500/35',  ringActive: 'ring-violet-500/80',  ringDescendant: 'ring-violet-400/50',  bgTint: 'bg-violet-50/50',  topGrad: 'from-violet-400 via-purple-300 to-violet-400' },
};

// User-created act nodes use a neutral palette regardless of act type
const actUserConfig = { bar: 'bg-slate-400', dot: 'bg-slate-400', accent: 'text-slate-500', ring: 'ring-slate-400/35', ringActive: 'ring-slate-400/70', ringDescendant: 'ring-slate-300/50', bgTint: 'bg-slate-50/50', topGrad: 'from-slate-300 via-slate-200 to-slate-300' };

const typeConfig: Record<string, { gradient: string; accent: string; glow: string }> = {
    explore: { gradient: 'from-violet-500/10 via-indigo-500/5 to-transparent', accent: 'text-violet-500', glow: 'shadow-violet-500/20' },
    consult: { gradient: 'from-sky-500/10 via-cyan-500/5 to-transparent', accent: 'text-sky-500', glow: 'shadow-sky-500/20' },
    investigate: { gradient: 'from-emerald-500/10 via-teal-500/5 to-transparent', accent: 'text-emerald-500', glow: 'shadow-emerald-500/20' },
    note: { gradient: 'from-amber-500/10 via-yellow-500/5 to-transparent', accent: 'text-amber-500', glow: 'shadow-amber-500/20' },
    act: { gradient: 'from-blue-500/10 via-indigo-500/5 to-transparent', accent: 'text-blue-500', glow: 'shadow-blue-500/20' },
    suggestion: { gradient: 'from-violet-500/10 via-purple-500/5 to-transparent', accent: 'text-violet-500', glow: 'shadow-violet-500/20' },
    topic: { gradient: 'from-blue-500/20 via-cyan-500/10 to-transparent', accent: 'text-blue-600', glow: 'shadow-blue-500/25' },
    cluster: { gradient: 'from-teal-500/20 via-emerald-500/10 to-transparent', accent: 'text-teal-600', glow: 'shadow-teal-500/25' },
    subcluster: { gradient: 'from-orange-500/20 via-amber-500/10 to-transparent', accent: 'text-orange-600', glow: 'shadow-orange-500/25' },
    claim: { gradient: 'from-rose-500/20 via-red-500/10 to-transparent', accent: 'text-rose-600', glow: 'shadow-rose-500/25' },
    default: { gradient: 'from-slate-500/10 via-slate-400/5 to-transparent', accent: 'text-slate-500', glow: 'shadow-slate-500/20' },
};

export function GraphNodeCard({ id, type, data, selected, isConnectable, sourcePosition, targetPosition }: NodeProps<GraphNodeRender>) {
    const updateNodeInternals = useUpdateNodeInternals();
    const showThoughts = useStreamPreferencesStore((state) => state.showThoughts);
    const nodeKind = data.kind;
    const cfg = typeConfig[nodeKind ?? 'default'] || typeConfig.default;
    const kindLabel = nodeKind ? nodeKind.replace(/_/g, ' ') : undefined;
    const isExpanded = data.isExpanded === true;
    const isNodeStreaming = data.isStreaming === true;
    const createdBy = data.createdBy;
    const referencedNodes = Array.isArray(data.referencedNodes) ? data.referencedNodes : [];
    const hasChildNodes = data.hasChildNodes === true;
    const branchExpanded = data.branchExpanded === true;
    const hiddenChildCount = typeof data.hiddenChildCount === 'number' ? data.hiddenChildCount : 0;
    const isEditing = data.isEditing === true;
    const actStage = data.actStage;
    const isRadialMode = data.layoutMode === 'radial' && data.nodeSource === 'persisted';
    const [editValue, setEditValue] = useState(data.label);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const isActNode = data.kind === 'act';
    const isDraftAct = isActNode && actStage === 'draft';
    const nodeDepth = typeof data.radialDepth === 'number' ? data.radialDepth : 0;
    const rootHue = typeof data.rootHue === 'number' ? data.rootHue : 210;
    const depthBgColor = isActNode ? undefined
        : `hsl(${rootHue}, ${Math.max(40 - nodeDepth * 10, 6)}%, ${Math.min(92 + nodeDepth * 2, 98.5)}%)`;
    const activityOpacity = isActNode && typeof data.activityOpacity === 'number'
        ? data.activityOpacity
        : undefined;
    const activeRelation = data.activeRelation as 'self' | 'descendant' | null | undefined;
    const currentTitle = (isEditing ? editValue : data.label || '').trim();
    const collapsedTitleWidth = getCollapsedNodeWidth(currentTitle, data.kind, hasChildNodes);
    const expandedTitleWidth = getExpandedNodeWidth(currentTitle, data.kind);
    const cardWidth = isActNode
        ? (isExpanded ? expandedTitleWidth : collapsedTitleWidth)
        : (isExpanded ? expandedTitleWidth : collapsedTitleWidth);
    const cardMaxWidth = isActNode ? GRAPH_ACT_NODE_EXPANDED_WIDTH : GRAPH_NODE_EXPANDED_WIDTH;
    const expandedMaxHeight = isActNode ? GRAPH_ACT_NODE_EXPANED_MAX_HEIGHT : GRAPH_NODE_EXPANDED_MAX_HEIGHT;
    const { height: cardHeight } = getLayoutDimensionsForNodeType(type, isExpanded, data.kind);
    const inputRef = useRef<HTMLInputElement>(null);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const showMetaRow = isExpanded || isNodeStreaming;
    const hasThoughtText = Boolean(showThoughts && data.thoughtMd);
    const hasBodyText = Boolean(data.contextSummary || data.contentMd || hasThoughtText);
    const hasActionButtons = Boolean(data.actions && data.actions.length > 0);
    const hasReferences = referencedNodes.length > 0;
    const childActNodes = Array.isArray(data.childActNodes) ? data.childActNodes : [];
    const parentActNode = data.parentActNode ?? null;
    const usedContextNodeIds = Array.isArray(data.usedContextNodeIds) ? data.usedContextNodeIds : [];
    const usedTools = Array.isArray(data.usedTools) ? data.usedTools : [];
    const usedSources = Array.isArray(data.usedSources) ? data.usedSources : [];
    const hasRunTrace = usedContextNodeIds.length > 0 || usedTools.length > 0 || usedSources.length > 0;
    const [runTraceOpen, setRunTraceOpen] = useState(false);
    const nodeContextLabelMap = React.useMemo(() => {
        const map: Record<string, string> = {};
        const ctxs = Array.isArray(data.usedSelectedNodeContexts) ? data.usedSelectedNodeContexts : [];
        for (const ctx of ctxs) {
            if (ctx.nodeId && ctx.label) map[ctx.nodeId] = ctx.label;
        }
        return map;
    }, [data.usedSelectedNodeContexts]);
    const retryQuery = typeof data.label === 'string' ? data.label.trim() : '';
    const canRetry = isActNode && retryQuery.length > 0 && typeof data.onRunAction === 'function' && !isNodeStreaming;
    const actStageLabel = actStage === 'thinking'
        ? 'Thinking'
        : actStage === 'ready'
            ? 'Ready'
            : actStage === 'draft'
                ? 'Draft'
                : undefined;
    const internalsSignature = JSON.stringify({
        label: data.label,
        expanded: data.isExpanded === true,
        editing: data.isEditing === true,
        streaming: data.isStreaming === true,
        actStage: data.isExpanded === true || data.isStreaming === true ? data.actStage : undefined,
        bodyLength: data.isExpanded === true
            ? (data.contentMd?.length ?? 0) + (data.thoughtMd?.length ?? 0) + (data.contextSummary?.length ?? 0) + (data.detailHtml?.length ?? 0)
            : 0,
        referenceCount: data.isExpanded === true ? (data.referencedNodes?.length ?? 0) : 0,
    });

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            if ((data.label ?? '').trim().length === 0) {
                inputRef.current.select();
            } else {
                const length = inputRef.current.value.length;
                inputRef.current.setSelectionRange(length, length);
            }
        }
    }, [data.label, isEditing]);

    useEffect(() => {
        setEditValue(data.label);
    }, [data.label]);

    useEffect(() => {
        window.requestAnimationFrame(() => {
            updateNodeInternals(id);
        });
    }, [id, internalsSignature, updateNodeInternals]);

    const commitEdit = useCallback(() => {
        data.onCommitLabel?.(editValue);
    }, [data, editValue]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            commitEdit();
        } else if (e.key === 'Escape') {
            // Restore original or clear if it's a new empty node
            const defaultVal = data.label || '';
            setEditValue(defaultVal);
            data.onCommitLabel?.(defaultVal);
        }
    }, [commitEdit, data]);

    const handleMediaFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !data.onAddMedia) {
            return;
        }
        setIsUploadingMedia(true);
        try {
            await data.onAddMedia(file);
        } finally {
            setIsUploadingMedia(false);
            if (mediaInputRef.current) {
                mediaInputRef.current.value = '';
            }
        }
    }, [data]);

    if (data.kind === 'suggestion') {
        const suggestionQuery = typeof data.contentMd === 'string' ? data.contentMd : '';
        const canExplore = suggestionQuery.length > 0 && typeof data.onRunAction === 'function' && !isNodeStreaming;
        return (
            <div
                className={`nodrag group relative flex min-w-[140px] max-w-[260px] cursor-default flex-col gap-1 rounded-xl border border-dashed border-violet-300/60 bg-gradient-to-br ${cfg.gradient} px-3 py-2.5 shadow-sm transition-all hover:border-violet-400/80 hover:shadow-md`}
                style={{ backdropFilter: 'blur(4px)' }}
            >
                <Handle type="target" position={targetPosition ?? Position.Top} className="opacity-0" />
                <div className="flex items-start gap-1.5">
                    <span className="mt-0.5 text-violet-400">✦</span>
                    <span className="flex-1 text-[12px] font-medium leading-snug text-slate-700">{data.label || suggestionQuery}</span>
                </div>
                {canExplore && (
                    <button
                        className="nodrag mt-1 flex items-center gap-1 self-end rounded-full border border-violet-200 bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-violet-600 shadow-sm transition-all hover:bg-violet-50 hover:shadow"
                        onClick={(e) => {
                            e.stopPropagation();
                            data.onRunAction?.(suggestionQuery);
                        }}
                    >
                        <span>▶</span>
                        <span>深掘り</span>
                    </button>
                )}
                <Handle type="source" position={sourcePosition ?? Position.Bottom} className="opacity-0" />
            </div>
        );
    }

    if (isActNode) {
        const atc = createdBy === 'user'
            ? actUserConfig
            : (actTypeConfig[nodeKind ?? 'act'] ?? actTypeConfig.act);
        const statusDot = isDraftAct
            ? 'bg-slate-300'
            : isNodeStreaming
                ? `${atc.dot} animate-pulse`
                : atc.dot;

        const relationClass = selected
            ? `ring-2 ${atc.ring} ring-offset-1 ring-offset-background border-transparent scale-[1.015] shadow-[0_8px_28px_-8px_rgba(15,23,42,0.22)]`
            : activeRelation === 'self'
                ? `ring-2 ${atc.ringActive} ring-offset-2 ring-offset-background border-transparent shadow-[0_0_16px_-2px_var(--tw-ring-color)] scale-[1.01]`
                : activeRelation === 'descendant'
                    ? `ring-1 ${atc.ringDescendant} ring-offset-1 ring-offset-background ${atc.bgTint}`
                    : 'hover:border-slate-300/70 hover:shadow-[0_6px_24px_-8px_rgba(15,23,42,0.22)]';

        return (
            <div className="relative group">
                <input
                    ref={mediaInputRef}
                    type="file"
                    className="hidden"
                    onChange={(event) => void handleMediaFileChange(event)}
                    accept=".txt,.md,.pdf,.html,.csv,.json,.doc,.docx,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.mp4,.mov"
                />
                <div
                    style={{
                        width: cardWidth,
                        minWidth: ACT_NODE_COMPACT_WIDTH,
                        maxWidth: cardMaxWidth,
                        ...(activityOpacity !== undefined ? { opacity: activityOpacity } : {}),
                    }}
                    className={[
                        'relative overflow-hidden rounded-[18px] border transition-all duration-300',
                        isDraftAct
                            ? 'border-slate-200/80 bg-white/95 shadow-[0_2px_8px_-4px_rgba(15,23,42,0.08)]'
                            : 'border-slate-200/60 bg-white/97 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.18)]',
                        relationClass,
                        isExpanded ? 'nowheel' : '',
                    ].join(' ')}
                >
                    {/* Top gradient line — actType colour, visible when ready/expanded */}
                    {!isDraftAct && (
                        <div className={`absolute top-0 inset-x-0 h-[2.5px] bg-gradient-to-r ${atc.topGrad} ${isNodeStreaming ? 'opacity-100' : 'opacity-60'}`}>
                            {isNodeStreaming && (
                                <div className="absolute inset-0 h-full w-[200%] -ml-[100%] bg-gradient-to-r from-transparent via-white/70 to-transparent animate-[shimmer_1.2s_linear_infinite]" />
                            )}
                        </div>
                    )}

                    {/* Left accent bar */}
                    <div className={[
                        'absolute left-0 top-[14px] bottom-[14px] w-[3px] rounded-r-full',
                        isDraftAct ? 'bg-slate-200' : atc.bar,
                        isNodeStreaming ? 'opacity-60' : 'opacity-90',
                    ].join(' ')} />

                    {/* Branch toggle */}
                    {hasChildNodes && (
                        <div className="absolute right-2.5 top-2.5 z-10">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-6 w-6 rounded-full border-slate-200/80 bg-white/90 text-slate-500 shadow-sm backdrop-blur-sm hover:bg-white"
                                onClick={(event: React.MouseEvent) => {
                                    event.stopPropagation();
                                    data.onToggleBranch?.();
                                }}
                            >
                                {branchExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </Button>
                        </div>
                    )}

                    {/* ── Collapsed header ── */}
                    {!isExpanded && (
                        <div className={`relative flex flex-col gap-1 pl-5 pr-3.5 py-2.5 ${hasChildNodes ? 'pr-10' : ''}`}>
                            <div className="flex items-center gap-2">
                                <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${statusDot}`} />
                                {isEditing ? (
                                    <input
                                        ref={inputRef}
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onBlur={commitEdit}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Ask a question..."
                                        className="flex-1 min-w-0 bg-transparent border-b border-primary outline-none text-[14px] font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal pb-0.5"
                                    />
                                ) : (
                                    <h3 className="flex-1 min-w-0 truncate text-[14px] font-semibold leading-snug text-slate-800">
                                        {data.label || <span className="font-normal italic text-slate-400">Ask a question…</span>}
                                    </h3>
                                )}
                                {hasReferences && (
                                    <span className="shrink-0 rounded-full border border-teal-200/80 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-600 tabular-nums">
                                        {referencedNodes.length}
                                    </span>
                                )}
                            </div>
                            {actStage === 'ready' && data.contentMd && (
                                <p className="ml-4 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                                    {data.contentMd.slice(0, 120)}
                                </p>
                            )}
                            {childActNodes.length > 0 && (
                                <div className="ml-4 flex items-center gap-1">
                                    <ChevronRight className="h-2.5 w-2.5 text-slate-400" />
                                    <span className="text-[10px] font-medium text-slate-400">
                                        {childActNodes.length}件の派生
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Expanded header ── */}
                    {isExpanded && (
                        <div className={`relative pl-5 pr-3.5 pt-3 pb-2 ${hasChildNodes ? 'pr-10' : ''}`}>
                            {/* Meta row */}
                            <div className="mb-1.5 flex items-center gap-1.5">
                                {nodeKind && nodeKind !== 'act' && (
                                    <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${atc.accent}`}>
                                        {nodeKind}
                                    </span>
                                )}
                                <span className={`h-[6px] w-[6px] rounded-full ${statusDot}`} />
                                {actStageLabel && (
                                    <span className={`text-[10px] font-medium ${
                                        actStage === 'thinking' ? 'text-amber-500' : actStage === 'ready' ? 'text-slate-400' : 'text-slate-300'
                                    }`}>{actStageLabel}</span>
                                )}
                                <div className="ml-auto flex items-center gap-1.5">
                                    {!isDraftAct && createdBy && (
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                                            createdBy === 'agent' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        }`}>
                                            {createdBy === 'agent' ? <Bot className="h-2.5 w-2.5" /> : <UserRound className="h-2.5 w-2.5" />}
                                            {createdBy === 'agent' ? 'AI' : 'You'}
                                        </span>
                                    )}
                                    {isNodeStreaming && (
                                        <span className="flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-primary opacity-75" />
                                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                                        </span>
                                    )}
                                </div>
                            </div>
                            {/* Parent breadcrumb */}
                            {parentActNode && (
                                <button
                                    type="button"
                                    className="nodrag mb-1.5 flex items-center gap-1 self-start rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                    onClick={(e) => { e.stopPropagation(); data.onNavigateToNode?.(parentActNode.id); }}
                                >
                                    <ChevronRight className="h-2.5 w-2.5 rotate-180 opacity-60" />
                                    <span className="max-w-[180px] truncate">{parentActNode.label}</span>
                                </button>
                            )}
                            {/* Title */}
                            {isEditing ? (
                                <input
                                    ref={inputRef}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={commitEdit}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Ask a question..."
                                    className="w-full bg-transparent border-b-2 border-primary outline-none text-[15px] font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal pb-1 mt-0.5"
                                />
                            ) : (
                                <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-800">
                                    {data.label || <span className="font-normal italic text-slate-400">Ask a question…</span>}
                                </h3>
                            )}
                            {/* Referenced nodes */}
                            {referencedNodes.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                    <span className="text-[10px] font-medium text-slate-400">via</span>
                                    {referencedNodes.slice(0, 3).map((node) => (
                                        <button
                                            key={node.id}
                                            type="button"
                                            className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 transition-colors hover:bg-slate-100"
                                            onClick={(event: React.MouseEvent) => {
                                                event.stopPropagation();
                                                data.onOpenReferencedNode?.(node.id);
                                            }}
                                        >
                                            {node.label}
                                        </button>
                                    ))}
                                    {referencedNodes.length > 3 && (
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                                            +{referencedNodes.length - 3}
                                        </span>
                                    )}
                                </div>
                            )}
                            {/* Child act nodes */}
                            {childActNodes.length > 0 && (
                                <div className="mt-2 flex flex-col gap-1">
                                    <span className="text-[10px] font-medium text-slate-400">派生した問い</span>
                                    <div className="flex flex-wrap gap-1">
                                        {childActNodes.slice(0, 4).map((child) => (
                                            <button
                                                key={child.id}
                                                type="button"
                                                className="nodrag flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                                                onClick={(e) => { e.stopPropagation(); data.onNavigateToNode?.(child.id); }}
                                            >
                                                <span className="max-w-[140px] truncate">{child.label}</span>
                                                <ChevronRight className="h-2.5 w-2.5 shrink-0 opacity-50" />
                                            </button>
                                        ))}
                                        {childActNodes.length > 4 && (
                                            <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">
                                                +{childActNodes.length - 4}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Expanded content ── */}
                    {isExpanded && (
                        <div className={`border-t ${isDraftAct && !hasBodyText ? 'border-transparent' : 'border-slate-100'}`}>
                            <div
                                style={{ maxHeight: expandedMaxHeight }}
                                className={`overflow-y-auto ${isDraftAct ? 'px-5 py-2' : 'px-5 py-3'}`}
                                onWheel={(event) => { event.stopPropagation(); }}
                            >
                                {data.contextSummary && (
                                    <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
                                        {data.contextSummary}
                                    </p>
                                )}
                                {data.contentMd && (
                                    <div className="prose prose-sm max-w-none text-slate-700 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:text-[13px] [&_p]:leading-relaxed [&_li]:text-[13px] [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-semibold [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[11px] [&_pre]:bg-slate-100 [&_pre]:rounded-md [&_pre]:p-2.5 [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_a]:text-blue-600 [&_a]:underline [&_table]:text-[12px] [&_th]:font-semibold [&_th]:text-left [&_th]:py-1 [&_td]:py-1">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {data.contentMd}
                                        </ReactMarkdown>
                                    </div>
                                )}
                                {data.detailHtml && !data.contentMd && (
                                    <div
                                        className="text-[13px] leading-relaxed text-slate-700 [&_a]:text-blue-600 [&_a]:underline [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_h1]:font-bold [&_h2]:font-semibold [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
                                        dangerouslySetInnerHTML={{ __html: data.detailHtml }}
                                    />
                                )}
                                {showThoughts && data.thoughtMd && (
                                    <div className="mt-3 rounded-md border border-amber-200/80 bg-amber-50/60 px-3 py-2">
                                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">Thought</p>
                                        <div className="text-[12px] whitespace-pre-wrap leading-relaxed text-amber-900/85">
                                            {data.thoughtMd}
                                        </div>
                                    </div>
                                )}
                                {/* Run trace — collapsible */}
                                {hasRunTrace && (
                                    <div className="mt-3 rounded-md border border-slate-200/80 bg-slate-50/70">
                                        <button
                                            type="button"
                                            className="nodrag flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
                                            onClick={(e) => { e.stopPropagation(); setRunTraceOpen((v) => !v); }}
                                        >
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Run Trace</span>
                                            <ChevronDown className={`ml-auto h-3 w-3 text-slate-400 transition-transform duration-200 ${runTraceOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {runTraceOpen && (
                                            <div className="border-t border-slate-200/80 px-2.5 pb-2 pt-1.5 flex flex-col gap-1.5">
                                                {usedTools.length > 0 && (
                                                    <div className="flex flex-wrap items-start gap-1">
                                                        <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                                                        <div className="flex flex-wrap gap-1">
                                                            {usedTools.map((tool) => (
                                                                <span key={tool} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
                                                                    {tool}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {usedContextNodeIds.length > 0 && (
                                                    <div className="flex flex-wrap items-start gap-1">
                                                        <Network className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                                                        <div className="flex flex-wrap gap-1">
                                                            {usedContextNodeIds.map((nid) => (
                                                                <span key={nid} className="rounded border border-teal-200/80 bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-700">
                                                                    {nodeContextLabelMap[nid] ?? nid}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {usedSources.length > 0 && (
                                                    <div className="flex flex-wrap items-start gap-1">
                                                        <Globe className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                                                        <div className="flex flex-wrap gap-1">
                                                            {usedSources.map((s) => (
                                                                s.uri ? (
                                                                    <a
                                                                        key={s.id}
                                                                        href={s.uri}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="nodrag flex items-center gap-0.5 rounded border border-blue-200/80 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 hover:bg-blue-100 transition-colors"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        {s.label || s.id}
                                                                        <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                                                                    </a>
                                                                ) : (
                                                                    <span key={s.id} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
                                                                        {s.label || s.id}
                                                                    </span>
                                                                )
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {hasChildNodes && !branchExpanded && hiddenChildCount > 0 && (
                                    <div className="mt-2">
                                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500">
                                            {hiddenChildCount} child{hiddenChildCount > 1 ? 'ren' : ''} hidden
                                        </span>
                                    </div>
                                )}
                                {/* Action buttons */}
                                {(hasActionButtons || actStage === 'draft') && (
                                    <div className={`flex flex-wrap gap-2 ${hasBodyText || hasRunTrace ? 'mt-3 pt-2.5 border-t border-slate-100' : 'mt-0'}`}>
                                        {actStage === 'draft' && data.onAddMedia && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="h-7 px-2.5 text-[11px] font-semibold rounded-md border border-slate-200 bg-white shadow-sm hover:bg-primary hover:text-white hover:border-primary transition-all nodrag nopan"
                                                onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
                                                onPointerUp={(e: React.PointerEvent) => e.stopPropagation()}
                                                onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); mediaInputRef.current?.click(); }}
                                            >
                                                {isUploadingMedia ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5 mr-1.5" />}
                                                Add Media
                                            </Button>
                                        )}
                                        {data.actions?.map((action: { label: string; execute: string }, idx: number) => (
                                            <Button
                                                key={idx}
                                                variant="secondary"
                                                size="sm"
                                                className={['h-7 px-2.5 text-[11px] font-semibold rounded-md border border-slate-200 bg-white shadow-sm hover:bg-primary hover:text-white hover:border-primary transition-all group/btn', isNodeStreaming ? 'opacity-50 pointer-events-none' : ''].join(' ')}
                                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); data.onRunAction?.(action.label); }}
                                            >
                                                <Play className="w-3.5 h-3.5 mr-1.5 opacity-70 group-hover/btn:opacity-100 transition-all" />
                                                {action.label}
                                            </Button>
                                        ))}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className={['h-7 px-2.5 text-[11px] font-semibold rounded-md border border-slate-200 bg-white shadow-sm hover:bg-primary hover:text-white hover:border-primary transition-all group/btn', canRetry ? '' : 'opacity-40 pointer-events-none'].join(' ')}
                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (canRetry) data.onRunAction?.(retryQuery); }}
                                        >
                                            <RotateCcw className="w-3.5 h-3.5 mr-1.5 opacity-70 group-hover/btn:opacity-100 transition-all" />
                                            Retry
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Handles */}
                <Handle type="target" id="target-left" position={targetPosition ?? Position.Left} isConnectable={isConnectable} className="!w-2.5 !h-2.5 !bg-slate-700 !border-2 !border-white !shadow-sm" />
                <Handle type="source" id="source-right" position={sourcePosition ?? Position.Right} isConnectable={isConnectable} className="!w-2.5 !h-2.5 !bg-slate-700 !border-2 !border-white !shadow-sm" />
                <Handle type="target" id="target-right" position={Position.Right} isConnectable={isConnectable} className="!w-2.5 !h-2.5 !bg-slate-700 !border-2 !border-white !shadow-sm" />
                <Handle type="source" id="source-left" position={Position.Left} isConnectable={isConnectable} className="!w-2.5 !h-2.5 !bg-slate-700 !border-2 !border-white !shadow-sm" />
                <Handle type="target" id="target-top" position={Position.Top} isConnectable={isConnectable} className="!w-2 !h-2 !bg-slate-600 !border-2 !border-white/90 !shadow-sm opacity-60 group-hover:opacity-100" />
                <Handle type="source" id="source-top" position={Position.Top} style={{ marginTop: -8 }} isConnectable={isConnectable} className="!w-2 !h-2 !bg-slate-600 !border-2 !border-white/90 !shadow-sm opacity-60 group-hover:opacity-100" />
                <Handle type="target" id="target-bottom" position={Position.Bottom} isConnectable={isConnectable} className="!w-2 !h-2 !bg-slate-600 !border-2 !border-white/90 !shadow-sm opacity-60 group-hover:opacity-100" />
                <Handle type="source" id="source-bottom" position={Position.Bottom} style={{ marginTop: 8 }} isConnectable={isConnectable} className="!w-2 !h-2 !bg-slate-600 !border-2 !border-white/90 !shadow-sm opacity-60 group-hover:opacity-100" />
            </div>
        );
    }

    if (isRadialMode) {
        const radialDepth = typeof data.radialDepth === 'number' ? data.radialDepth : 0;
        const radialSize = radialDepth === 0 ? 132 : (radialDepth === 1 ? 120 : (radialDepth === 2 ? 108 : 96));

        return (
            <div className="relative group">
                <div
                    style={{ width: radialSize, height: radialSize }}
                    className={[
                        'relative flex items-center justify-center rounded-full border text-center transition-all duration-300',
                        'bg-white/96 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.34)]',
                        selected
                            ? 'border-primary ring-2 ring-primary/80 ring-offset-2 ring-offset-background scale-[1.04]'
                            : 'border-slate-200/90 hover:border-primary/40',
                    ].join(' ')}
                >
                    <div className={`absolute inset-[7px] rounded-full border ${selected ? 'border-primary/18' : 'border-white/90'}`} />
                    <div className="relative z-10 flex max-w-[78%] flex-col items-center justify-center gap-1">
                        <span className={`${radialDepth === 0 ? 'text-[13px]' : 'text-[11px]'} font-semibold leading-tight text-slate-800`}>
                            {data.label}
                        </span>
                        {data.kind && (
                            <span className={`rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 ${radialDepth === 0 ? 'text-[10px]' : 'text-[9px]'} uppercase tracking-[0.08em] text-slate-500`}>
                                {data.kind}
                            </span>
                        )}
                    </div>
                    {hasChildNodes && (
                        <button
                            type="button"
                            className="absolute -bottom-1.5 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm"
                            onClick={(event) => {
                                event.stopPropagation();
                                data.onToggleBranch?.();
                            }}
                        >
                            {branchExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            <span className="sr-only">Toggle children</span>
                        </button>
                    )}
                </div>
                <Handle
                    type="target"
                    id="target-left"
                    position={targetPosition ?? Position.Left}
                    isConnectable={isConnectable}
                    className="!w-2.5 !h-2.5 !bg-slate-800 !border-2 !border-white !shadow-sm"
                />
                <Handle
                    type="source"
                    id="source-right"
                    position={sourcePosition ?? Position.Right}
                    isConnectable={isConnectable}
                    className="!w-2.5 !h-2.5 !bg-slate-800 !border-2 !border-white !shadow-sm"
                />
                <Handle
                    type="target"
                    id="target-right"
                    position={Position.Right}
                    isConnectable={isConnectable}
                    className="!w-2.5 !h-2.5 !bg-slate-800 !border-2 !border-white !shadow-sm"
                />
                <Handle
                    type="source"
                    id="source-left"
                    position={Position.Left}
                    isConnectable={isConnectable}
                    className="!w-2.5 !h-2.5 !bg-slate-800 !border-2 !border-white !shadow-sm"
                />
                <Handle
                    type="target"
                    id="target-top"
                    position={Position.Top}
                    isConnectable={isConnectable}
                    className="!w-2 !h-2 !bg-slate-700 !border-2 !border-white/90 !shadow-sm opacity-70 group-hover:opacity-100"
                />
                <Handle
                    type="source"
                    id="source-top"
                    position={Position.Top}
                    isConnectable={isConnectable}
                    style={{ marginTop: -8 }}
                    className="!w-2 !h-2 !bg-slate-700 !border-2 !border-white/90 !shadow-sm opacity-70 group-hover:opacity-100"
                />
                <Handle
                    type="target"
                    id="target-bottom"
                    position={Position.Bottom}
                    isConnectable={isConnectable}
                    className="!w-2 !h-2 !bg-slate-700 !border-2 !border-white/90 !shadow-sm opacity-70 group-hover:opacity-100"
                />
                <Handle
                    type="source"
                    id="source-bottom"
                    position={Position.Bottom}
                    isConnectable={isConnectable}
                    style={{ marginTop: 8 }}
                    className="!w-2 !h-2 !bg-slate-700 !border-2 !border-white/90 !shadow-sm opacity-70 group-hover:opacity-100"
                />
            </div>
        );
    }

    return (
        <div className="relative group">
            <input
                ref={mediaInputRef}
                type="file"
                className="hidden"
                onChange={(event) => void handleMediaFileChange(event)}
                accept=".txt,.md,.pdf,.html,.csv,.json,.doc,.docx,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.mp4,.mov"
            />
            {/* Main Card Container */}
            <div
                style={{
                    width: cardWidth,
                    height: (nodeKind === 'topic' && !isExpanded) ? cardHeight : undefined,
                    minWidth: isActNode
                        ? ACT_NODE_COMPACT_WIDTH
                        : NODE_COLLAPSED_BASE_WIDTH,
                    maxWidth: cardMaxWidth,
                    ...(depthBgColor ? { backgroundColor: depthBgColor } : {}),
                    ...(activityOpacity !== undefined ? { opacity: activityOpacity } : {}),
                }}
                className={`
                group relative rounded-2xl transition-all duration-300 origin-left ${isExpanded ? 'nowheel' : ''}
                border
                ${isActNode
                    ? (isDraftAct
                        ? 'rounded-[20px] border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_10px_24px_-18px_rgba(15,23,42,0.28)] hover:shadow-[0_14px_30px_-18px_rgba(37,99,235,0.2)]'
                        : 'rounded-[22px] border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] backdrop-blur-md shadow-[0_14px_34px_-22px_rgba(15,23,42,0.42)] hover:shadow-[0_18px_40px_-22px_rgba(37,99,235,0.32)]')
                    : 'border-border/40 bg-background shadow-md hover:shadow-xl'}
                ${selected
                    ? (isActNode
                        ? 'ring-2 ring-primary/70 ring-offset-2 ring-offset-background border-primary/50 scale-[1.02] shadow-[0_18px_42px_-20px_rgba(37,99,235,0.34)]'
                        : 'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50 scale-[1.02] shadow-xl')
                    : 'hover:border-primary/30'}
                ${isNodeStreaming ? 'animate-pulse-subtle' : ''}
            `}
            >
                {isExpanded && !isDraftAct && <div className={`absolute inset-y-3 left-0 ${isActNode ? 'w-[3px]' : 'hidden'} rounded-r-full bg-gradient-to-b from-blue-500/75 via-sky-400/55 to-transparent`} />}
                {isExpanded && !isDraftAct && <div className={`absolute top-0 right-0 ${isActNode ? 'w-20 h-20 -mr-10 -mt-10 bg-blue-100/50' : 'w-32 h-32 -mr-16 -mt-16 bg-white/5'} rounded-full blur-3xl pointer-events-none`} />}
                <div className={`absolute ${isActNode ? 'right-2.5 top-2.5' : 'right-3 top-3'} z-10`}>
                    <div className="flex items-center gap-2">
                        {hasChildNodes && (
                            <Button
                                variant="outline"
                                size="icon"
                                className={isActNode
                                    ? 'h-7 w-7 rounded-full border-slate-200/80 bg-white/90 text-slate-600 shadow-sm backdrop-blur-sm'
                                    : 'h-8 w-8 rounded-lg bg-background/90 backdrop-blur-sm'}
                                onClick={(event: React.MouseEvent) => {
                                    event.stopPropagation();
                                    data.onToggleBranch?.();
                                }}
                            >
                                {branchExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                <span className="sr-only">Toggle children</span>
                            </Button>
                        )}
                    </div>
                </div>

                <div
                    className={`relative ${
                        isActNode
                            ? (hasChildNodes ? `px-3.5 ${isExpanded ? (isDraftAct ? 'pt-2.5 pb-0' : 'pt-3 pb-0') : 'py-2.5'} pr-10` : `px-3.5 ${isExpanded ? (isDraftAct ? 'pt-2.5 pb-0' : 'pt-3 pb-0') : 'py-2.5'}`)
                            : (hasChildNodes ? `px-3.5 ${isExpanded ? 'pt-3.5 pb-0' : 'py-3'} pr-12` : `px-3.5 ${isExpanded ? 'pt-3.5 pb-0' : 'py-3'}`)
                    }`}
                >
                    <div className={`flex-1 min-w-0 ${isExpanded ? 'pt-0.5' : 'pt-0'}`}>
                        {showMetaRow && (
                            <div className="mb-1 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                {isExpanded && actStageLabel && (
                                    <span className={`inline-flex items-center rounded-full border ${isActNode ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'} font-medium ${
                                        actStage === 'thinking'
                                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                                            : actStage === 'ready'
                                                ? 'border-blue-200 bg-blue-50 text-blue-700'
                                                : 'border-slate-200 bg-slate-50 text-slate-700'
                                    }`}>
                                        {actStageLabel}
                                    </span>
                                )}
                                {isExpanded && !isDraftAct && createdBy && (
                                    <span
                                        className={[
                                            `inline-flex items-center gap-1 rounded-full border ${isActNode ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'} font-medium`,
                                            createdBy === 'agent'
                                                ? 'border-blue-200 bg-blue-50 text-blue-700'
                                                : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                                        ].join(' ')}
                                    >
                                        {createdBy === 'agent' ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                                        {createdBy === 'agent' ? 'AI' : 'You'}
                                    </span>
                                )}
                                {(data.detailHtml || data.contentMd) && (
                                    <span className={`inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50/50 ${isActNode ? 'px-1 py-0.5' : 'px-1.5 py-0.5'} text-slate-500`}>
                                        {data.detailHtml ? (
                                            <Code className="h-3 w-3" aria-label="Contains HTML/CSS" />
                                        ) : (
                                            <FileText className="h-3 w-3" aria-label="Contains Markdown" />
                                        )}
                                    </span>
                                )}
                            </div>
                            {isExpanded && nodeKind && nodeKind !== 'act' && (
                                <Badge
                                    variant="outline"
                                    className={`text-[11px] px-2 py-0 border-primary/20 bg-primary/5 font-medium ${cfg.accent}`}
                                >
                                    {kindLabel}
                                </Badge>
                            )}
                            {isNodeStreaming && (
                                <span className="flex h-2 w-2 ml-auto">
                                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-primary opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                </span>
                            )}
                            </div>
                        )}
                        {!isExpanded && isActNode && hasReferences && (
                            <div className="mb-1 flex items-center gap-1.5">
                                <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                                    {referencedNodes.length} context
                                </span>
                            </div>
                        )}

                        {isEditing ? (
                            <input
                                ref={inputRef}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask a question..."
                                className={`w-full bg-transparent border-b-2 border-primary outline-none text-foreground placeholder:text-muted-foreground/40 pb-1 ${isExpanded ? 'mt-1 text-base font-semibold' : 'text-[14px] font-medium'}`}
                            />
                        ) : (
                            <h3
                                className={`${isActNode ? 'text-[14px] tracking-[-0.01em]' : 'text-base'} ${isActNode ? 'font-medium' : 'font-semibold'} leading-snug text-foreground ${isExpanded ? 'line-clamp-2 mt-0.5' : 'truncate whitespace-nowrap'}`}
                            >
                                {data.label || <span className="text-muted-foreground/50 italic">Ask a question...</span>}
                            </h3>
                        )}
                        {/* ── Topic node brief (collapsed only) ── */}
                        {!isExpanded && !isActNode && nodeKind === 'topic' && (
                            <div className="mt-2 min-h-[52px] flex flex-col justify-center">
                                {data.contextSummary ? (
                                    <p className="line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
                                        {data.contextSummary}
                                    </p>
                                ) : data.briefGenerating ? (
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        <span>Generating…</span>
                                    </div>
                                ) : data.onGenerateBrief ? (
                                    <button
                                        type="button"
                                        className="nodrag flex w-fit items-center gap-1 rounded-full border border-dashed border-primary/30 px-2.5 py-1 text-[11px] font-medium text-primary/60 transition-colors hover:border-primary/60 hover:text-primary"
                                        onClick={(e) => { e.stopPropagation(); data.onGenerateBrief?.(); }}
                                    >
                                        <span>✦</span>
                                        <span>Generate brief</span>
                                    </button>
                                ) : null}
                            </div>
                        )}

                        {isExpanded && referencedNodes.length > 0 && (
                            <div className={`flex flex-wrap gap-1.5 ${isActNode ? 'mt-1.5' : 'mt-2'}`}>
                                <span className={`${isActNode ? 'text-[10px]' : 'text-[11px]'} font-medium text-muted-foreground/70`}>
                                    Sources
                                </span>
                                {referencedNodes.slice(0, 3).map((node) => (
                                    <button
                                        key={node.id}
                                        type="button"
                                        className={`rounded-full border border-border/60 bg-muted/50 ${isActNode ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'} text-foreground/80 transition-colors hover:bg-muted`}
                                        onClick={(event: React.MouseEvent) => {
                                            event.stopPropagation();
                                            data.onOpenReferencedNode?.(node.id);
                                        }}
                                    >
                                        {node.label}
                                    </button>
                                ))}
                                {referencedNodes.length > 3 && (
                                    <span className={`rounded-full border border-border/60 bg-muted/30 ${isActNode ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'} text-muted-foreground`}>
                                        +{referencedNodes.length - 3}
                                    </span>
                                )}
                            </div>
                        )}
                        {isExpanded && isActNode && hasRunTrace && (
                            <div className="mt-2 rounded-md border border-slate-200/80 bg-slate-50/70 px-2.5 py-2">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">Run Trace</p>
                                {usedTools.length > 0 && (
                                    <p className="mt-1 text-[11px] text-slate-700">tools: {usedTools.join(', ')}</p>
                                )}
                                {usedContextNodeIds.length > 0 && (
                                    <p className="mt-1 text-[11px] text-slate-700">nodes: {usedContextNodeIds.join(', ')}</p>
                                )}
                                {usedSources.length > 0 && (
                                    <p className="mt-1 text-[11px] text-slate-700">sources: {usedSources.map((source) => source.label || source.id).join(', ')}</p>
                                )}
                            </div>
                        )}
                        {isExpanded && hasChildNodes && !branchExpanded && hiddenChildCount > 0 && (
                            <div className="mt-2">
                                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                                    {hiddenChildCount} child{hiddenChildCount > 1 ? 'ren' : ''} hidden
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {isExpanded && (
                    <div className={`relative ${isDraftAct && !hasBodyText ? 'bg-transparent' : `border-t ${isActNode ? 'border-slate-200/70 bg-slate-50/60' : 'border-border/20 bg-muted/10'}`}`}>
                        <div
                            style={{ maxHeight: expandedMaxHeight }}
                            className={`overflow-y-auto ${isActNode ? (isDraftAct ? 'px-3.5 py-2' : 'px-3 py-2.5') : 'px-4 py-3'}`}
                            onWheel={(event) => {
                                event.stopPropagation();
                            }}
                        >
                            {data.contextSummary ? (
                                <p className={`text-muted-foreground ${isActNode ? 'mb-2 text-[11px]' : 'mb-3 text-xs'} leading-relaxed`}>
                                    {data.contextSummary}
                                </p>
                            ) : null}
                            {data.contentMd ? (
                                <div className={`${isActNode ? 'text-[13px]' : 'text-sm'} text-foreground/80 leading-relaxed whitespace-pre-wrap`}>
                                    {data.contentMd}
                                </div>
                            ) : null}

                            {showThoughts && data.thoughtMd ? (
                                <div className="mt-3 rounded-md border border-amber-200/80 bg-amber-50/60 px-3 py-2">
                                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">Thought</p>
                                    <div className={`${isActNode ? 'text-[12px]' : 'text-xs'} whitespace-pre-wrap leading-relaxed text-amber-900/85`}>
                                        {data.thoughtMd}
                                    </div>
                                </div>
                            ) : null}

                            {data.actions && data.actions.length > 0 && (
                                <div className={`flex flex-wrap gap-2 ${isDraftAct && !hasBodyText ? 'mt-0 pt-0' : `border-t border-border/20 ${isActNode ? 'mt-3 pt-2.5' : 'mt-4 pt-3'}`}`}>
                                    {isActNode && actStage === 'draft' && data.onAddMedia && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            className={[
                                                `${isActNode ? 'h-7 text-[11px] px-2.5 rounded-md' : 'h-8 text-xs px-3 rounded-lg'} font-semibold shadow-sm border border-border/50`,
                                                'bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary',
                                                'transition-all duration-300 nodrag nopan',
                                                isUploadingMedia ? 'opacity-60 pointer-events-none' : '',
                                            ].join(' ')}
                                            onPointerDown={(e: React.PointerEvent) => {
                                                e.stopPropagation();
                                            }}
                                            onPointerUp={(e: React.PointerEvent) => {
                                                e.stopPropagation();
                                            }}
                                            onMouseDown={(e: React.MouseEvent) => {
                                                e.stopPropagation();
                                            }}
                                            onClick={(e: React.MouseEvent) => {
                                                e.stopPropagation();
                                                mediaInputRef.current?.click();
                                            }}
                                        >
                                            {isUploadingMedia ? (
                                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                            ) : (
                                                <FileUp className="w-3.5 h-3.5 mr-1.5" />
                                            )}
                                            Add Media
                                        </Button>
                                    )}
                                    {data.actions.map((action: { label: string, execute: string }, idx: number) => (
                                        <Button
                                            key={idx}
                                            variant="secondary"
                                            size="sm"
                                            className={[
                                                `${isActNode ? 'h-7 text-[11px] px-2.5 rounded-md' : 'h-8 text-xs px-3 rounded-lg'} font-semibold shadow-sm border border-border/50`,
                                                'bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary',
                                                'transition-all duration-300 group/btn',
                                                isNodeStreaming ? 'opacity-50 pointer-events-none' : '',
                                            ].join(' ')}
                                            onClick={(e: React.MouseEvent) => {
                                                e.stopPropagation();
                                                data.onRunAction?.(action.label);
                                            }}
                                        >
                                            <Play className="w-3.5 h-3.5 mr-1.5 opacity-70 group-hover/btn:opacity-100 group-hover/btn:scale-110 transition-all duration-300" />
                                            {action.label}
                                        </Button>
                                    ))}
                                </div>
                            )}
                            {isActNode && actStage === 'draft' && data.onAddMedia && (!data.actions || data.actions.length === 0) && (
                                <div className={`flex flex-wrap gap-2 ${isDraftAct && !hasActionButtons && !hasBodyText ? 'mt-0 pt-0' : `border-t border-border/20 ${isActNode ? 'mt-3 pt-2.5' : 'mt-4 pt-3'}`}`}>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className={[
                                            `${isActNode ? 'h-7 text-[11px] px-2.5 rounded-md' : 'h-8 text-xs px-3 rounded-lg'} font-semibold shadow-sm border border-border/50`,
                                            'bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary',
                                            'transition-all duration-300 nodrag nopan',
                                            isUploadingMedia ? 'opacity-60 pointer-events-none' : '',
                                        ].join(' ')}
                                        onPointerDown={(e: React.PointerEvent) => {
                                            e.stopPropagation();
                                        }}
                                        onPointerUp={(e: React.PointerEvent) => {
                                            e.stopPropagation();
                                        }}
                                        onMouseDown={(e: React.MouseEvent) => {
                                            e.stopPropagation();
                                        }}
                                        onClick={(e: React.MouseEvent) => {
                                            e.stopPropagation();
                                            mediaInputRef.current?.click();
                                        }}
                                    >
                                        {isUploadingMedia ? (
                                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                        ) : (
                                            <FileUp className="w-3.5 h-3.5 mr-1.5" />
                                        )}
                                        Add Media
                                    </Button>
                                </div>
                            )}
                            {isActNode && (
                                <div className={`flex flex-wrap gap-2 ${isDraftAct && !hasActionButtons && !hasBodyText ? 'mt-0 pt-0' : `border-t border-border/20 ${isActNode ? 'mt-3 pt-2.5' : 'mt-4 pt-3'}`}`}>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={[
                                            `${isActNode ? 'h-7 text-[11px] px-2.5 rounded-md' : 'h-8 text-xs px-3 rounded-lg'} font-semibold shadow-sm border border-border/50`,
                                            'bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary',
                                            'transition-all duration-300 group/btn',
                                            canRetry ? '' : 'opacity-50 pointer-events-none',
                                        ].join(' ')}
                                        onClick={(e: React.MouseEvent) => {
                                            e.stopPropagation();
                                            if (!canRetry) {
                                                return;
                                            }
                                            data.onRunAction?.(retryQuery);
                                        }}
                                    >
                                        <RotateCcw className="w-3.5 h-3.5 mr-1.5 opacity-70 group-hover/btn:opacity-100 group-hover/btn:scale-110 transition-all duration-300" />
                                        Retry
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {/* Streaming Progress Bar */}
                {isNodeStreaming && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/30 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary/40 via-primary to-primary/40 animate-[shimmer_1.5s_infinite] w-[200%] -ml-[50%]" />
                    </div>
                )}
            </div>

            {/* Custom Handles */}
            <Handle
                type="target"
                id="target-left"
                position={targetPosition ?? Position.Left}
                isConnectable={isConnectable}
                className="!w-2.5 !h-2.5 !bg-slate-800 !border-2 !border-white !shadow-sm"
            />
            <Handle
                type="source"
                id="source-right"
                position={sourcePosition ?? Position.Right}
                isConnectable={isConnectable}
                className="!w-2.5 !h-2.5 !bg-slate-800 !border-2 !border-white !shadow-sm"
            />
            <Handle
                type="target"
                id="target-right"
                position={Position.Right}
                isConnectable={isConnectable}
                className="!w-2.5 !h-2.5 !bg-slate-800 !border-2 !border-white !shadow-sm"
            />
            <Handle
                type="source"
                id="source-left"
                position={Position.Left}
                isConnectable={isConnectable}
                className="!w-2.5 !h-2.5 !bg-slate-800 !border-2 !border-white !shadow-sm"
            />
            <Handle
                type="target"
                id="target-top"
                position={Position.Top}
                isConnectable={isConnectable}
                className="!w-2 !h-2 !bg-slate-700 !border-2 !border-white/90 !shadow-sm opacity-70 group-hover:opacity-100"
            />
            <Handle
                type="source"
                id="source-top"
                position={Position.Top}
                isConnectable={isConnectable}
                style={{ marginTop: -8 }}
                className="!w-2 !h-2 !bg-slate-700 !border-2 !border-white/90 !shadow-sm opacity-70 group-hover:opacity-100"
            />
            <Handle
                type="target"
                id="target-bottom"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="!w-2 !h-2 !bg-slate-700 !border-2 !border-white/90 !shadow-sm opacity-70 group-hover:opacity-100"
            />
            <Handle
                type="source"
                id="source-bottom"
                position={Position.Bottom}
                isConnectable={isConnectable}
                style={{ marginTop: 8 }}
                className="!w-2 !h-2 !bg-slate-700 !border-2 !border-white/90 !shadow-sm opacity-70 group-hover:opacity-100"
            />
        </div>
    );
}
