"use client";

import { ReviewOpCard } from './ReviewOpCard';
import { useReviewInbox, type ReviewInboxFilter } from '../hooks/useReviewInbox';

const filters: ReviewInboxFilter[] = ['all', 'needs review', 'approved', 'history'];

export function ReviewInboxPanel() {
    const { filter, setFilter, items } = useReviewInbox();

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="border-b p-4">
                <div className="text-sm font-semibold text-slate-900">Review Inbox</div>
                <p className="mt-1 text-xs text-slate-500">Read-only organizeOps feed with state badges and trace visibility.</p>
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
                        No review operations match the current filter.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {items.map((item) => (
                            <ReviewOpCard key={item.opId} item={item} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}