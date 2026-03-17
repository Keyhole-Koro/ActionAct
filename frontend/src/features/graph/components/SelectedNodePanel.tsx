"use client";

import React from 'react';

import { truncate } from '@/lib/string';
import { useGraphStore } from '@/features/graph/store';

function kindLabel(kind: string): string {
    if (kind === 'act') return 'act';
    return kind;
}

export function SelectedNodePanel() {
    const persistedNodes = useGraphStore((s) => s.persistedNodes);
    const actNodes = useGraphStore((s) => s.actNodes);
    const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);

    if (selectedNodeIds.length === 0) return null;

    const allNodes = [...persistedNodes, ...actNodes];
    const selectedNodes = selectedNodeIds
        .map((id) => allNodes.find((n) => n.id === id))
        .filter((n): n is NonNullable<typeof n> => n !== undefined);

    if (selectedNodes.length === 0) return null;

    return (
        <div className="absolute bottom-4 left-4 z-20 w-[256px] overflow-hidden rounded-xl border border-slate-200/80 bg-white/92 shadow-md backdrop-blur-sm">
            <div className="border-b border-slate-100 px-3 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {selectedNodes.length === 1 ? '1 node selected' : `${selectedNodes.length} nodes selected`}
                </p>
            </div>
            <ul className="max-h-[200px] overflow-y-auto divide-y divide-slate-100">
                {selectedNodes.map((node) => {
                    const data = node.data as Record<string, unknown>;
                    const label = typeof data.label === 'string' && data.label.trim()
                        ? data.label.trim()
                        : node.id;
                    const kind = typeof data.kind === 'string' && data.kind ? data.kind : null;
                    const snippet = (() => {
                        for (const key of ['contextSummary', 'contentMd', 'thoughtMd'] as const) {
                            const v = data[key];
                            if (typeof v === 'string' && v.trim()) return truncate(v.trim(), 120);
                        }
                        return null;
                    })();

                    return (
                        <li key={node.id} className="px-3 py-2">
                            <div className="flex items-start gap-1.5">
                                {kind && (
                                    <span className="mt-px shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-500">
                                        {kindLabel(kind)}
                                    </span>
                                )}
                                <p className="text-xs font-medium leading-snug text-slate-800 break-words min-w-0">
                                    {label}
                                </p>
                            </div>
                            {snippet && (
                                <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-slate-500">
                                    {snippet}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
