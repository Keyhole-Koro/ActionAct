"use client";

import React from 'react';
import { truncate } from '@/lib/string';
import type { GraphNodeBase } from '../../types';

interface RecentClickedSelectorProps {
    recentClickedNodeIds: string[];
    referenceableNodeById: Map<string, GraphNodeBase>;
    activeNodeId: string | null;
    onSelectNode: (nodeId: string) => void;
}

function firstMeaningfulLine(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const lines = value
        .split(/\r?\n/)
        .map((line) => line.replace(/^#+\s*/, '').trim())
        .filter((line) => line.length > 0);
    return lines.length > 0 ? lines[0] : null;
}

function resolveRecentNodeLabel(nodeId: string, data: Record<string, unknown> | undefined): string {
    const rawLabel = typeof data?.label === 'string' ? data.label.trim() : '';
    if (rawLabel.length > 0 && rawLabel !== nodeId) {
        return rawLabel;
    }

    const fallbackFromSummary = firstMeaningfulLine(data?.contextSummary);
    if (fallbackFromSummary) {
        return fallbackFromSummary;
    }

    const fallbackFromContent = firstMeaningfulLine(data?.contentMd);
    if (fallbackFromContent) {
        return fallbackFromContent;
    }

    return 'Untitled node';
}

export function RecentClickedSelector({
    recentClickedNodeIds,
    referenceableNodeById,
    activeNodeId,
    onSelectNode,
}: RecentClickedSelectorProps) {
    if (recentClickedNodeIds.length === 0) return null;

    return (
        <div className="pointer-events-none absolute left-1/2 top-14 z-20 flex w-[min(820px,calc(100%-2rem))] -translate-x-1/2 items-center justify-center gap-1.5">
            {recentClickedNodeIds.map((nodeId, index) => {
                const node = referenceableNodeById.get(nodeId);
                if (!node) {
                    return null;
                }
                const data = node?.data as Record<string, unknown> | undefined;
                const label = resolveRecentNodeLabel(nodeId, data);
                const isActive = activeNodeId === nodeId;

                return (
                    <React.Fragment key={nodeId}>
                        {index > 0 && <span className="text-[11px] font-semibold text-slate-400">&lt;&lt;</span>}
                        <button
                            type="button"
                            className={[
                                'pointer-events-auto max-w-[140px] rounded-xl border px-3 py-1.5 text-left text-xs font-medium transition-colors',
                                isActive
                                    ? 'border-slate-900/70 bg-slate-900/70 text-white'
                                    : 'border-slate-200/70 bg-white/60 text-slate-700 hover:border-slate-300/80 hover:bg-white/75',
                            ].join(' ')}
                            title={label}
                            onClick={() => onSelectNode(nodeId)}
                        >
                            <span className="block truncate">{truncate(label, 18)}</span>
                        </button>
                    </React.Fragment>
                );
            })}
        </div>
    );
}
