"use client";

import React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Check, Circle, Sparkle } from 'lucide-react';
import { useAgentInteractionStore } from '@/features/agentInteraction/store/interactionStore';
import { UiSelectionOption, SelectionMode, SelectionStatus } from '@/features/agentInteraction/types';

type SelectionNodeData = UiSelectionOption & {
    groupId: string;
    selectionMode: SelectionMode;
    groupStatus: SelectionStatus;
};

export type SelectionNode = Node<Record<string, unknown>, 'selectionNode'>;

export function SelectionNodeCard({ data, isConnectable, sourcePosition, targetPosition }: NodeProps<Node>) {
    const nodeData = data as unknown as SelectionNodeData;
    const { toggleOptionSelection } = useAgentInteractionStore();
    const isReadOnly = nodeData.groupStatus !== 'pending';

    const handleSelect = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isReadOnly) {
            toggleOptionSelection(nodeData.groupId, nodeData.option_id);
        }
    };

    // Dynamic style by state
    const isSelected = nodeData.selected;
    const isPending = !isReadOnly;

    return (
        <>
            <Handle
                type="target"
                position={targetPosition ?? Position.Left}
                isConnectable={isConnectable}
                className="!w-2 !h-2 !bg-amber-400 !border-2 !border-background !-left-1"
            />

            <div
                onClick={handleSelect}
                className={[
                    'group relative w-[260px] rounded-xl border-2 transition-all duration-300 ease-out',
                    'backdrop-blur-md overflow-hidden',
                    isPending ? 'cursor-pointer' : 'cursor-default',
                    // Selected state
                    isSelected && isPending
                        ? 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-400 shadow-lg shadow-amber-500/15 ring-2 ring-amber-400/50 ring-offset-1 ring-offset-background'
                        : '',
                    // Unselected pending
                    !isSelected && isPending
                        ? 'bg-card/70 border-dashed border-amber-300/60 hover:border-amber-400 hover:shadow-md hover:-translate-y-0.5 hover:bg-amber-50/40 dark:hover:bg-amber-950/20'
                        : '',
                    // Read-only selected
                    isSelected && !isPending
                        ? 'bg-muted/60 border-primary/30 opacity-80'
                        : '',
                    // Read-only not selected
                    !isSelected && !isPending
                        ? 'bg-muted/30 border-muted opacity-40'
                        : '',
                ].filter(Boolean).join(' ')}
            >
                {/* Shimmer accent for selected */}
                {isSelected && isPending && (
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-400/10 via-transparent to-orange-400/5 pointer-events-none" />
                )}

                {/* Header */}
                <div className="relative p-3 pb-2 flex items-start gap-2.5">
                    {/* Selection indicator */}
                    <div className={[
                        'mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200',
                        nodeData.selectionMode === 'single'
                            ? (isSelected
                                ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                                : 'border-2 border-amber-300 bg-background')
                            : (isSelected
                                ? 'bg-amber-500 text-white rounded-md shadow-sm shadow-amber-500/30'
                                : 'border-2 border-amber-300 bg-background rounded-md'),
                    ].join(' ')}>
                        {isSelected && (
                            nodeData.selectionMode === 'single'
                                ? <Circle className="w-2 h-2 fill-current" />
                                : <Check className="w-3 h-3" strokeWidth={3} />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold leading-tight text-foreground">
                            {nodeData.label}
                        </h3>
                    </div>

                    {/* Status badge */}
                    {isSelected && isPending && (
                        <Badge className="text-[9px] px-1.5 py-0 bg-amber-500 hover:bg-amber-500 text-white border-0 shadow-sm">
                            <Sparkle className="w-2.5 h-2.5 mr-0.5" />
                            Selected
                        </Badge>
                    )}
                </div>

                {/* Content */}
                {nodeData.reason && (
                    <div className="relative px-3 pb-1.5 pl-10">
                        <p className="text-[11px] text-amber-700/85 leading-relaxed">
                            {nodeData.reason}
                        </p>
                    </div>
                )}
                {nodeData.content_md && (
                    <div className="relative px-3 pb-2.5 pl-10">
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                            {nodeData.content_md}
                        </p>
                    </div>
                )}

                {/* Footer hint */}
                {isPending && (
                    <div className="relative px-3 pb-2.5 pl-10">
                        <span className="text-[10px] text-amber-600/70 dark:text-amber-400/50 font-medium tracking-wide">
                            {isSelected ? 'Click to deselect' : 'Click to select'}
                        </span>
                    </div>
                )}
            </div>

            <Handle
                type="source"
                position={sourcePosition ?? Position.Right}
                isConnectable={isConnectable}
                className="!w-2 !h-2 !bg-amber-400 !border-2 !border-background !-right-1"
            />
        </>
    );
}
