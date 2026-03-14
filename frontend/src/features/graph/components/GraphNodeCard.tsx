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
                startStream(trimmed, { clear: false });
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
        <>
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="!w-2.5 !h-2.5 !bg-primary/60 !border-2 !border-background !-top-1.5 transition-all hover:!scale-150"
            />

            <div
                className={[
                    'group w-[240px] rounded-xl border transition-all duration-300 ease-out',
                    'bg-card/80 backdrop-blur-md',
                    'hover:shadow-lg hover:-translate-y-0.5',
                    selected
                        ? `ring-2 ring-primary ring-offset-2 ring-offset-background shadow-xl ${cfg.glow}`
                        : 'shadow-md border-border/60 hover:border-border',
                ].join(' ')}
            >
                <div className={`absolute inset-0 rounded-xl bg-gradient-to-b ${cfg.gradient} pointer-events-none`} />

                {/* Header */}
                <div className="relative p-3 pb-2 flex items-start gap-2">
                    <div className={`mt-0.5 p-1.5 rounded-lg bg-background/80 border border-border/40 ${cfg.accent}`}>
                        <TypeIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        {isEditing ? (
                            <input
                                ref={inputRef}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={handleKeyDown}
                                placeholder="Enter node title..."
                                className="w-full text-sm font-semibold bg-transparent border-b border-primary/40 outline-none text-foreground placeholder:text-muted-foreground/50 pb-0.5"
                            />
                        ) : (
                            <h3
                                className="text-sm font-semibold leading-tight truncate text-foreground cursor-text"
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditValue(data.label);
                                    setEditingNode(id);
                                }}
                            >
                                {data.label || 'Untitled'}
                            </h3>
                        )}
                        <Badge
                            variant="secondary"
                            className="mt-1 text-[9px] px-1.5 py-0 uppercase tracking-wider font-medium opacity-70"
                        >
                            {data.type}
                        </Badge>
                    </div>
                </div>

                {/* Content preview */}
                <div className="relative px-3 pb-2">
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {data.contentMd || 'Double-click to edit...'}
                    </p>
                </div>

                {/* Actions */}
                {data.actions && data.actions.length > 0 && (
                    <div className="relative px-3 pb-3 pt-1 flex flex-wrap gap-1.5 border-t border-border/30 mt-1">
                        {data.actions.map((action: { label: string, execute: string }, idx: number) => (
                            <Button
                                key={idx}
                                variant="ghost"
                                size="sm"
                                className={[
                                    'h-7 text-[10px] px-2.5 rounded-lg font-medium',
                                    'bg-primary/5 hover:bg-primary/10 text-primary',
                                    'transition-all duration-200 hover:shadow-sm',
                                    isStreaming ? 'opacity-50' : '',
                                ].join(' ')}
                                disabled={isStreaming}
                                onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setSelectedNodes([id]);
                                    startStream(action.label, { clear: false });
                                }}
                            >
                                <Play className="w-3 h-3 mr-1" />
                                {action.label}
                            </Button>
                        ))}
                    </div>
                )}

                {/* Streaming indicator */}
                {isStreaming && (
                    <div className="absolute -bottom-1 left-3 right-3 h-0.5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary via-primary/60 to-primary animate-pulse rounded-full" />
                    </div>
                )}
            </div>

            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="!w-2.5 !h-2.5 !bg-primary/60 !border-2 !border-background !-bottom-1.5 transition-all hover:!scale-150"
            />
        </>
    );
}
