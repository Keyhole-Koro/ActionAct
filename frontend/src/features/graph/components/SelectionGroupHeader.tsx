"use client";

import React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, CheckCircle2, XCircle, AlertCircle, RotateCcw, X, Send } from 'lucide-react';
import { useAgentInteractionStore } from '@/features/agentInteraction/store/interactionStore';
import { SelectionStatus, SelectionHeaderData, SelectionOption } from '@/features/agentInteraction/types';

export type SelectionHeaderNode = Node<Record<string, unknown>, 'selectionHeader'>;

const statusConfig: Record<SelectionStatus, {
    label: string;
    icon: React.ElementType;
    gradient: string;
    border: string;
    badge: string;
    pulse: boolean;
}> = {
    pending: {
        label: 'Awaiting your input',
        icon: Clock,
        gradient: 'from-amber-500/15 via-orange-500/5 to-transparent',
        border: 'border-amber-300',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
        pulse: true,
    },
    selected: {
        label: 'Confirmed',
        icon: CheckCircle2,
        gradient: 'from-emerald-500/15 via-green-500/5 to-transparent',
        border: 'border-emerald-300',
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
        pulse: false,
    },
    expired: {
        label: 'Expired',
        icon: AlertCircle,
        gradient: 'from-slate-500/10 via-slate-400/5 to-transparent',
        border: 'border-muted',
        badge: 'bg-muted text-muted-foreground',
        pulse: false,
    },
    cancelled: {
        label: 'Cancelled',
        icon: XCircle,
        gradient: 'from-red-500/10 via-rose-400/5 to-transparent',
        border: 'border-red-200',
        badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
        pulse: false,
    },
};

export function SelectionGroupHeader({ data }: NodeProps<Node>) {
    const nodeData = data as unknown as SelectionHeaderData;
    const { confirmSelection, clearSelection, cancelGroup } = useAgentInteractionStore();

    const isPending = nodeData.status === 'pending';
    const selectedCount = nodeData.options.filter((opt: SelectionOption) => opt.selected).length;
    const canConfirm = isPending && (nodeData.selection_mode === 'single' ? selectedCount === 1 : selectedCount > 0);

    const cfg = statusConfig[nodeData.status];
    const StatusIcon = cfg.icon;

    return (
        <>
            <Handle type="target" position={Position.Top} isConnectable={false} className="!opacity-0" />

            <div className={[
                'relative w-[420px] rounded-2xl border-2 overflow-hidden transition-all duration-300',
                'bg-card/90 backdrop-blur-lg shadow-xl',
                cfg.border,
                isPending ? 'shadow-amber-500/10' : '',
            ].join(' ')}>
                {/* Gradient overlay */}
                <div className={`absolute inset-0 bg-gradient-to-br ${cfg.gradient} pointer-events-none`} />

                {/* Pulsing top accent bar */}
                {cfg.pulse && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400 animate-pulse" />
                )}

                {/* Header */}
                <div className="relative p-4 pb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className={[
                            'p-2 rounded-xl',
                            isPending
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                                : 'bg-muted text-muted-foreground',
                        ].join(' ')}>
                            <StatusIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-foreground leading-tight">
                                {nodeData.title}
                            </h2>
                            <span className="text-[11px] text-muted-foreground font-medium">
                                {nodeData.selection_mode === 'single' ? 'Choose one' : 'Choose multiple'}
                            </span>
                        </div>
                    </div>
                    <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 font-semibold ${cfg.badge}`}>
                        {cfg.label}
                    </Badge>
                </div>

                {/* Instruction */}
                <div className="relative px-4 pb-3">
                    <p className="text-sm text-foreground/80 leading-relaxed">
                        {nodeData.instruction}
                    </p>
                </div>

                {/* Action bar */}
                {isPending && (
                    <div className="relative px-4 pb-4 pt-2 border-t border-border/30">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <div className={[
                                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
                                    selectedCount > 0
                                        ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                                        : 'bg-muted text-muted-foreground',
                                ].join(' ')}>
                                    {selectedCount}
                                </div>
                                <span className="text-xs text-muted-foreground font-medium">
                                    selected
                                </span>
                            </div>

                            <div className="flex gap-2">
                                {nodeData.selection_mode === 'multiple' && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs px-3 rounded-lg"
                                        onClick={() => clearSelection(nodeData.selection_group_id)}
                                        disabled={selectedCount === 0}
                                    >
                                        <RotateCcw className="w-3 h-3 mr-1" />
                                        Clear
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs px-3 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => cancelGroup(nodeData.selection_group_id)}
                                >
                                    <X className="w-3 h-3 mr-1" />
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    className={[
                                        'h-8 text-xs px-4 rounded-lg font-semibold transition-all duration-200',
                                        canConfirm
                                            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/25 hover:shadow-lg hover:shadow-amber-500/30'
                                            : 'opacity-50',
                                    ].join(' ')}
                                    onClick={() => confirmSelection(nodeData.selection_group_id)}
                                    disabled={!canConfirm}
                                >
                                    <Send className="w-3 h-3 mr-1" />
                                    Confirm
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} isConnectable={false} className="!opacity-0" />
        </>
    );
}
