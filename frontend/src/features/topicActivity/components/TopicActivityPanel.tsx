"use client";

import { TopicTimelineItem } from './TopicTimelineItem';
import { useTopicActivity, type TopicActivityFilter } from '../hooks/useTopicActivity';

const filters: TopicActivityFilter[] = ['all', 'processing', 'completed', 'failed'];

export function TopicActivityPanel() {
    const { filter, setFilter, items } = useTopicActivity();

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="border-b p-4">
                <div className="text-sm font-semibold text-slate-900">Topic Activity</div>
                <p className="mt-1 text-xs text-slate-500">Input progress, routing, draft, bundle, and outline updates grouped by input.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {filters.map((candidate) => {
                        const active = candidate === filter;
                        return (
                            <button
                                key={candidate}
                                type="button"
                                onClick={() => setFilter(candidate)}
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
                {items.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                        No activity items match the current filter.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {items.map((item) => (
                            <TopicTimelineItem key={item.inputId} item={item} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}