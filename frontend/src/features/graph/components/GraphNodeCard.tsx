"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Sparkles, FileText, Search, MessageSquare, Pencil, PanelRightOpen } from 'lucide-react';
import { useActStream } from '@/features/action/actionAct/hooks/useActStream';
import { useGraphStore } from '@/features/graph/store';
import { usePanelStore } from '@/features/layout/store/panel-store';
import {
    GRAPH_NODE_COLLAPSED_WIDTH,
    GRAPH_NODE_EXPANDED_MAX_HEIGHT,
    GRAPH_NODE_EXPANDED_WIDTH,
} from '../constants/nodeDimensions';

type CustomNode = Node<{
    label: string;
    kind?: string;
    actions?: { label: string, execute: string }[];
    contentMd?: string;
    contextSummary?: string;
}, 'customTask'>;

const typeConfig: Record<string, { icon: React.ElementType; gradient: string; accent: string; glow: string }> = {
    explore: { icon: Search, gradient: 'from-violet-500/10 via-indigo-500/5 to-transparent', accent: 'text-violet-500', glow: 'shadow-violet-500/20' },
    consult: { icon: MessageSquare, gradient: 'from-sky-500/10 via-cyan-500/5 to-transparent', accent: 'text-sky-500', glow: 'shadow-sky-500/20' },
    investigate: { icon: FileText, gradient: 'from-emerald-500/10 via-teal-500/5 to-transparent', accent: 'text-emerald-500', glow: 'shadow-emerald-500/20' },
    note: { icon: Pencil, gradient: 'from-amber-500/10 via-yellow-500/5 to-transparent', accent: 'text-amber-500', glow: 'shadow-amber-500/20' },
    act: { icon: Play, gradient: 'from-blue-500/10 via-indigo-500/5 to-transparent', accent: 'text-blue-500', glow: 'shadow-blue-500/20' },
    default: { icon: Sparkles, gradient: 'from-slate-500/10 via-slate-400/5 to-transparent', accent: 'text-slate-500', glow: 'shadow-slate-500/20' },
};

export function GraphNodeCard({ id, data, selected, isConnectable }: NodeProps<CustomNode>) {
    const { startStream, isStreaming } = useActStream();
    const { setSelectedNodes, editingNodeId, updateNodeLabel, removeNode, expandedNodeIds, setActiveNode } = useGraphStore();
    const { openPanel } = usePanelStore();
    const nodeKind = data.kind;
    const cfg = typeConfig[nodeKind ?? 'default'] || typeConfig.default;
    const TypeIcon = cfg.icon;
    const isExpanded = expandedNodeIds.includes(id);

    const isEditing = editingNodeId === id;
    const [editValue, setEditValue] = useState(data.label);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const commitEdit = useCallback(() => {
        const trimmed = editValue.trim();
        if (trimmed) {
            updateNodeLabel(id, trimmed);

            // If it's a newly created act node starting with no previous valid label, 
            // trigger the stream automatically from what user typed!
            if (data.kind === 'act' && !data.label) {
                // Ensure nodes are selected contextually if needed, but here we just fire it
                setSelectedNodes([id]);
                startStream(id, trimmed, { clear: false });
            }
        } else {
            // Empty label → remove the node
            removeNode(id);
        }
    }, [id, editValue, updateNodeLabel, removeNode, data.kind, data.label, setSelectedNodes, startStream]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            commitEdit();
        }
    }, [commitEdit]);

    return (
        <div className="relative group">
            {/* Main Card Container */}
            <div
                style={{
                    width: isExpanded ? GRAPH_NODE_EXPANDED_WIDTH : GRAPH_NODE_COLLAPSED_WIDTH,
                    minWidth: GRAPH_NODE_COLLAPSED_WIDTH,
                    maxWidth: GRAPH_NODE_EXPANDED_WIDTH,
                }}
                className={`
                group relative rounded-2xl transition-all duration-300 origin-left ${isExpanded ? 'nowheel' : ''}
                bg-background border border-border/40
                shadow-md hover:shadow-xl
                ${selected || isExpanded ? 'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50 scale-[1.02] shadow-xl' : 'hover:border-primary/30'}
                ${isStreaming ? 'animate-pulse-subtle' : ''}
            `}
            >
                {/* Subtle top primary line accent */}
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r ${cfg.gradient} opacity-80`} />
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                <div className="absolute right-3 top-3 z-10">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg bg-background/90 backdrop-blur-sm"
                        onClick={(event: React.MouseEvent) => {
                            event.stopPropagation();
                            setActiveNode(id);
                            openPanel('node-detail', id);
                        }}
                    >
                        <PanelRightOpen className="mr-1.5 h-3.5 w-3.5" />
                        Details
                    </Button>
                </div>

                <div className="relative p-4 pb-0 pr-24 flex gap-3">
                    {/* Icon Container with active styling */}
                    {data.kind !== 'act' && (
                        <div className="relative shrink-0 mt-0.5 group">
                            <div className={`absolute inset-0 bg-gradient-to-br ${cfg.gradient} opacity-10 group-hover:opacity-20 blur-sm transition-opacity duration-300`} />
                            <div className={`relative flex items-center justify-center w-10 h-10 rounded-xl bg-background border border-border/50 shadow-sm group-hover:shadow transition-shadow ${cfg.accent}`}>
                                <TypeIcon className="w-5 h-5" />
                            </div>
                        </div>
                    )}

                    <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            {nodeKind && nodeKind !== 'act' && (
                                <Badge
                                    variant="outline"
                                    className={`text-[10px] px-2 py-0 border-primary/20 bg-primary/5 uppercase tracking-widest font-bold ${cfg.accent}`}
                                >
                                    {nodeKind}
                                </Badge>
                            )}
                            {isStreaming && (
                                <span className="flex h-2 w-2 ml-auto">
                                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-primary opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                </span>
                            )}
                        </div>

                        {isEditing ? (
                            <input
                                ref={inputRef}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask a question..."
                                className="w-full text-base font-bold bg-transparent border-b-2 border-primary outline-none text-foreground placeholder:text-muted-foreground/40 pb-1 mt-1 font-heading"
                            />
                        ) : (
                            <h3
                                className="text-base font-bold leading-snug text-foreground line-clamp-2 mt-0.5 font-heading"
                            >
                                {data.label || <span className="text-muted-foreground/50 italic">Ask a question...</span>}
                            </h3>
                        )}
                    </div>
                </div>

                {!isExpanded && data.contentMd && (
                    <div className="relative px-4 pt-3 pb-4">
                        <p className="text-sm text-foreground/80 leading-relaxed font-medium line-clamp-3">
                            {data.contentMd}
                        </p>
                    </div>
                )}
                {!isExpanded && !data.contentMd && <div className="h-4"></div>}

                {isExpanded && (
                    <div className="relative border-t border-border/20 bg-muted/10">
                        <div
                            style={{ maxHeight: GRAPH_NODE_EXPANDED_MAX_HEIGHT }}
                            className="overflow-y-auto px-4 py-3"
                            onWheel={(event) => {
                                event.stopPropagation();
                            }}
                        >
                            {data.contextSummary ? (
                                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                                    {data.contextSummary}
                                </p>
                            ) : null}
                            {data.contentMd ? (
                                <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                                    {data.contentMd}
                                </div>
                            ) : null}

                            {data.actions && data.actions.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-2 border-t border-border/20 pt-3">
                                    {data.actions.map((action: { label: string, execute: string }, idx: number) => (
                                        <Button
                                            key={idx}
                                            variant="secondary"
                                            size="sm"
                                            className={[
                                                'h-8 text-xs px-3 rounded-lg font-semibold shadow-sm border border-border/50',
                                                'bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary',
                                                'transition-all duration-300 group/btn',
                                                isStreaming ? 'opacity-50 pointer-events-none' : '',
                                            ].join(' ')}
                                            onClick={(e: React.MouseEvent) => {
                                                e.stopPropagation();
                                                setSelectedNodes([id]);
                                                startStream(id, action.label, { clear: false });
                                            }}
                                        >
                                            <Play className="w-3.5 h-3.5 mr-1.5 opacity-70 group-hover/btn:opacity-100 group-hover/btn:scale-110 transition-all duration-300" />
                                            {action.label}
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Actions Area */}
                {!isExpanded && data.actions && data.actions.length > 0 && (
                    <div className="relative px-4 pb-4 pt-2 flex flex-wrap gap-2 border-t border-border/20 bg-muted/10">
                        {data.actions.map((action: { label: string, execute: string }, idx: number) => (
                            <Button
                                key={idx}
                                variant="secondary"
                                size="sm"
                                className={[
                                    'h-8 text-xs px-3 rounded-lg font-semibold shadow-sm border border-border/50',
                                    'bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary',
                                    'transition-all duration-300 group/btn',
                                    isStreaming ? 'opacity-50 pointer-events-none' : '',
                                ].join(' ')}
                                onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setSelectedNodes([id]);
                                    startStream(id, action.label, { clear: false });
                                }}
                            >
                                <Play className="w-3.5 h-3.5 mr-1.5 opacity-70 group-hover/btn:opacity-100 group-hover/btn:scale-110 transition-all duration-300" />
                                {action.label}
                            </Button>
                        ))}
                    </div>
                )}

                {/* Streaming Progress Bar */}
                {isStreaming && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/30 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary/40 via-primary to-primary/40 animate-[shimmer_1.5s_infinite] w-[200%] -ml-[50%]" />
                    </div>
                )}
            </div>

            {/* Custom Handles */}
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="!w-4 !h-4 !bg-background !border-2 !border-primary !shadow-md !-top-2 hover:!scale-125 hover:!bg-primary transition-all duration-300 z-10"
            />
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="!w-4 !h-4 !bg-background !border-2 !border-primary !shadow-md !-bottom-2 hover:!scale-125 hover:!bg-primary transition-all duration-300 z-10"
            />
        </div>
    );
}
