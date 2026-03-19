"use client";

import { Handle, NodeProps, Position } from '@xyflow/react';
import { Ban, Check, CheckSquare, Circle, CircleDot, Clock3, Square } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SelectionHeaderData, SelectionNodeData, SelectionStatus } from '@/features/agentInteraction/types';

function statusCopy(status: SelectionStatus) {
    switch (status) {
        case 'selected':
            return {
                badge: 'Selection confirmed',
                helper: 'Processing your selection',
                badgeClassName: 'border-emerald-300 bg-emerald-50 text-emerald-700',
            };
        case 'expired':
            return {
                badge: 'Selection expired',
                helper: 'Selection expired',
                badgeClassName: 'border-slate-300 bg-slate-100 text-slate-600',
            };
        case 'cancelled':
            return {
                badge: 'Selection cancelled',
                helper: 'Selection cancelled',
                badgeClassName: 'border-rose-300 bg-rose-50 text-rose-700',
            };
        case 'pending':
        default:
            return {
                badge: 'Waiting for your choice',
                helper: 'Waiting for your input',
                badgeClassName: 'border-amber-300 bg-amber-50 text-amber-800',
            };
    }
}

function formatSelectionCount(selectedCount: number, optionCount: number) {
    return `${selectedCount}/${optionCount} selected`;
}

function HiddenHandles() {
    return (
        <>
            <Handle
                type="target"
                position={Position.Left}
                isConnectable={false}
                className="!h-2 !w-2 !border-0 !bg-transparent"
            />
            <Handle
                type="source"
                position={Position.Right}
                isConnectable={false}
                className="!h-2 !w-2 !border-0 !bg-transparent"
            />
        </>
    );
}

export function SelectionHeaderNodeCard({ data }: NodeProps) {
    const typedData = data as SelectionHeaderData;
    const copy = statusCopy(typedData.status);
    const pending = typedData.status === 'pending';

    return (
        <div className="relative" data-stop-node-click="true">
            <div className="w-[420px] rounded-[24px] border border-amber-300/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(254,243,199,0.9))] p-4 shadow-[0_18px_44px_-24px_rgba(180,83,9,0.45)] backdrop-blur-sm">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Badge className="border-amber-300 bg-amber-100 text-amber-900">Select</Badge>
                            <Badge variant="outline" className={copy.badgeClassName}>
                                {copy.badge}
                            </Badge>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-amber-950">{typedData.title}</h3>
                            <p className="mt-1 text-xs leading-5 text-amber-900/80">{typedData.instruction}</p>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-amber-300/70 bg-white/70 px-3 py-2 text-right shadow-sm">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-800/80">Selection</div>
                        <div className="mt-1 text-sm font-semibold text-amber-950">
                            {formatSelectionCount(typedData.selectedCount, typedData.optionCount)}
                        </div>
                    </div>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-200/80 bg-white/70 px-3 py-2 text-xs text-amber-900/80">
                    <Clock3 className="h-3.5 w-3.5 text-amber-700" />
                    <span>{copy.helper}</span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        disabled={!typedData.canConfirm}
                        onClick={(event) => {
                            event.stopPropagation();
                            typedData.onConfirm();
                        }}
                        className="rounded-full bg-amber-900 text-amber-50 hover:bg-amber-950 disabled:bg-slate-300"
                    >
                        <Check className="mr-1 h-4 w-4" />
                        Confirm
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!typedData.canClear}
                        onClick={(event) => {
                            event.stopPropagation();
                            typedData.onClear();
                        }}
                        className="rounded-full border-amber-300 bg-white/70 text-amber-900 hover:bg-amber-50 disabled:text-slate-400"
                    >
                        Clear
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={!typedData.canCancel}
                        onClick={(event) => {
                            event.stopPropagation();
                            typedData.onCancel();
                        }}
                        className="rounded-full text-amber-900 hover:bg-amber-100 disabled:text-slate-400"
                    >
                        Cancel
                    </Button>
                    <div className="ml-auto text-[11px] font-medium text-amber-900/70">
                        {typedData.selection_mode === 'single' ? 'Single choice' : 'Multiple choice'}
                    </div>
                </div>
                {!pending && (
                    <div className="mt-3 text-[11px] text-amber-900/60">
                        This group is now read-only.
                    </div>
                )}
            </div>
            <HiddenHandles />
        </div>
    );
}

export function SelectionOptionNodeCard({ data }: NodeProps) {
    const typedData = data as SelectionNodeData;
    const copy = statusCopy(typedData.status);
    const interactive = typedData.isInteractive;
    const Icon = typedData.mode === 'single'
        ? (typedData.isSelected ? CircleDot : Circle)
        : (typedData.isSelected ? CheckSquare : Square);

    return (
        <div className="relative" data-stop-node-click="true">
            <button
                type="button"
                disabled={!interactive}
                aria-disabled={!interactive}
                onClick={(event) => {
                    event.stopPropagation();
                    if (!interactive) {
                        return;
                    }
                    typedData.onSelect();
                }}
                className={[
                    'w-[260px] rounded-[22px] border border-dashed p-4 text-left shadow-[0_16px_36px_-28px_rgba(120,53,15,0.48)] transition-all duration-200',
                    typedData.isSelected
                        ? 'border-amber-500 bg-amber-100/95 ring-2 ring-amber-400/70 ring-offset-2 ring-offset-background'
                        : 'border-amber-300 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(255,247,237,0.94))] hover:border-amber-400 hover:bg-amber-50',
                    interactive ? 'cursor-pointer' : 'cursor-not-allowed opacity-70 grayscale-[0.18]',
                ].join(' ')}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Badge className="border-amber-300 bg-amber-100 text-amber-900">Select</Badge>
                            {typedData.isSelected && (
                                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                                    Selected
                                </Badge>
                            )}
                            {!interactive && typedData.status !== 'selected' && (
                                <Badge variant="outline" className={copy.badgeClassName}>
                                    {copy.badge}
                                </Badge>
                            )}
                        </div>
                        <div>
                            <div className="text-sm font-semibold leading-5 text-amber-950">{typedData.label}</div>
                            {typedData.reason && (
                                <p className="mt-1 text-xs leading-5 text-amber-900/75">{typedData.reason}</p>
                            )}
                        </div>
                    </div>
                    <div className="rounded-full border border-amber-300/80 bg-white/80 p-2 text-amber-800 shadow-sm">
                        <Icon className="h-4 w-4" />
                    </div>
                </div>
                {typedData.contentMd && (
                    <div className="mt-3 rounded-2xl border border-amber-200/80 bg-white/70 px-3 py-2 text-xs leading-5 text-amber-900/75">
                        {typedData.contentMd}
                    </div>
                )}
                <div className="mt-4 flex items-center justify-between text-[11px] font-medium text-amber-900/70">
                    <span>{typedData.mode === 'single' ? 'Click to choose immediately' : 'Toggle and confirm from header'}</span>
                    {!interactive && typedData.status !== 'selected' && <Ban className="h-3.5 w-3.5" />}
                </div>
            </button>
            <HiddenHandles />
        </div>
    );
}