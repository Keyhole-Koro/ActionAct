'use client';

import type { NodeProps } from '@xyflow/react';

export type ActTreeGroupData = {
    width: number;
    height: number;
    label: string;
    nodeCount: number;
    createdBy?: 'user' | 'agent';
};

/**
 * Background rectangle rendered behind each act node tree (root + descendants).
 * Visually groups related act nodes so it's clear they belong to one inquiry thread.
 */
export function ActTreeGroupNode({ data }: NodeProps) {
    const d = data as ActTreeGroupData;
    const isUser = d.createdBy === 'user';

    return (
        <div
            className="pointer-events-none select-none"
            style={{ width: d.width, height: d.height }}
        >
            {/* Background fill */}
            <div
                className="absolute inset-0 rounded-2xl"
                style={{
                    background: isUser
                        ? 'rgba(240, 249, 255, 0.55)'
                        : 'rgba(248, 250, 252, 0.60)',
                    border: isUser
                        ? '1.5px solid rgba(125, 211, 252, 0.30)'
                        : '1.5px solid rgba(148, 163, 184, 0.30)',
                    backdropFilter: 'blur(1px)',
                }}
            />
            {/* Header stripe */}
            <div
                className="absolute left-0 right-0 top-0 flex items-center gap-1.5 rounded-t-2xl px-3 py-1.5"
                style={{
                    background: isUser
                        ? 'rgba(224, 242, 254, 0.70)'
                        : 'rgba(241, 245, 249, 0.80)',
                    borderBottom: isUser
                        ? '1px solid rgba(125, 211, 252, 0.20)'
                        : '1px solid rgba(148, 163, 184, 0.20)',
                }}
            >
                {/* Dot */}
                <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: isUser ? '#38bdf8' : '#94a3b8' }}
                />
                {/* Root label */}
                <span
                    className="truncate text-[10px] font-semibold tracking-wide"
                    style={{
                        color: isUser ? '#0284c7' : '#64748b',
                        maxWidth: Math.max(d.width - 48, 60),
                    }}
                >
                    {d.label}
                </span>
                {/* Count badge */}
                {d.nodeCount > 1 && (
                    <span
                        className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                        style={{
                            background: isUser ? 'rgba(56,189,248,0.15)' : 'rgba(148,163,184,0.15)',
                            color: isUser ? '#0ea5e9' : '#94a3b8',
                        }}
                    >
                        {d.nodeCount}
                    </span>
                )}
            </div>
        </div>
    );
}
