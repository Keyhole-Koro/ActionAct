"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Sparkles, FileText, Search, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { useActStream } from '@/features/action/actionAct/hooks/useActStream';
import { useGraphStore } from '@/features/graph/store';

type CustomNode = Node<{
    label: string;
    type: string;
    actions?: { label: string, execute: string }[];
    contentMd?: string;
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
    const { setSelectedNodes, editingNodeId, setEditingNode, updateNodeLabel, removeNode } = useGraphStore();
    const cfg = typeConfig[data.type] || typeConfig.default;
    const TypeIcon = cfg.icon;

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
            if (data.type === 'act' && !data.label) {
                // Ensure nodes are selected contextually if needed, but here we just fire it
                setSelectedNodes([id]);
                startStream(id, trimmed, { clear: false });
            }
        } else {
            // Empty label → remove the node
            removeNode(id);
        }
    }, [id, editValue, updateNodeLabel, removeNode, data.type, data.label, setSelectedNodes, startStream]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            commitEdit();
        } else if (e.key === 'Escape') {
            setEditingNode(null);
        }
    }, [commitEdit, setEditingNode]);

    return (
        <div className="relative group">
            {/* Animated Glow Backdrop */}
            <div className={`absolute -inset-0.5 rounded-2xl blur-xl opacity-0 group-hover:opacity-60 transition-opacity duration-700 bg-gradient-to-tr ${cfg.gradient} pointer-events-none`} />

            {/* Main Card Container */}
            <div
                className={[
                    'relative w-[320px] rounded-2xl border transition-all duration-500 ease-out overflow-hidden',
                    'bg-background/60 backdrop-blur-xl',
                    'hover:shadow-2xl hover:-translate-y-1',
                    selected
                        ? `ring-2 ring-primary ring-offset-4 ring-offset-background shadow-2xl ${cfg.glow} border-transparent`
                        : 'shadow-lg border-border/40 hover:border-primary/50',
                ].join(' ')}
            >
                {/* Internal Animated Gradient Sweep */}
                <div className={`absolute inset-0 bg-gradient-to-br ${cfg.gradient} opacity-20 pointer-events-none group-hover:opacity-40 transition-opacity duration-500`} />
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

                {/* Header Section */}
                <div className="relative p-4 pb-0 flex gap-3">
                    {/* Icon Container with active glow */}
                    {data.type !== 'act' && (
                        <div className="relative shrink-0 mt-0.5">
                            <div className={`absolute inset-0 rounded-xl blur-md bg-gradient-to-br ${cfg.gradient} opacity-50 group-hover:opacity-100 transition-opacity`} />
                            <div className={`relative flex items-center justify-center w-10 h-10 rounded-xl bg-background/90 border border-border/50 shadow-inner ${cfg.accent}`}>
                                <TypeIcon className="w-5 h-5 drop-shadow-sm" />
                            </div>
                        </div>
                    )}

                    <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            {data.type !== 'act' && (
                                <Badge
                                    variant="outline"
                                    className={`text-[10px] px-2 py-0 border-primary/20 bg-primary/5 uppercase tracking-widest font-bold ${cfg.accent}`}
                                >
                                    {data.type}
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
                                className="text-base font-bold leading-snug text-foreground cursor-text line-clamp-2 mt-0.5 hover:text-primary transition-colors duration-300 font-heading"
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditingNode(id);
                                    setEditValue(data.label || '');
                                }}
                            >
                                {data.label || <span className="text-muted-foreground/50 italic">Ask a question...</span>}
                            </h3>
                        )}
                    </div>
                </div>

                {/* Content preview */}
                {data.contentMd && (
                    <div className="relative px-4 pt-3 pb-4">
                        <p className="text-sm text-foreground/80 leading-relaxed line-clamp-3 font-medium">
                            {data.contentMd}
                        </p>
                    </div>
                )}
                {!data.contentMd && <div className="h-4"></div>}

                {/* Actions Area */}
                {data.actions && data.actions.length > 0 && (
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
