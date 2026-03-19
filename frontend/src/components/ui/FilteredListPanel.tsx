"use client";

import React from 'react';

interface FilteredListPanelProps<F extends string> {
    title: string;
    description: string;
    filters: readonly F[];
    activeFilter: F;
    onFilterChange: (filter: F) => void;
    emptyMessage: string;
    isEmpty: boolean;
    children: React.ReactNode;
}

export function FilteredListPanel<F extends string>({
    title,
    description,
    filters,
    activeFilter,
    onFilterChange,
    emptyMessage,
    isEmpty,
    children,
}: FilteredListPanelProps<F>) {
    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="border-b p-4">
                <div className="text-sm font-semibold text-slate-900">{title}</div>
                <p className="mt-1 text-xs text-slate-500">{description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {filters.map((candidate) => {
                        const active = candidate === activeFilter;
                        return (
                            <button
                                key={candidate}
                                type="button"
                                onClick={() => onFilterChange(candidate)}
                                className={[
                                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                    active
                                        ? 'border-slate-900 bg-slate-900 text-white'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100',
                                ].join(' ')}
                            >
                                {candidate}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                {isEmpty ? (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                        {emptyMessage}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
}
