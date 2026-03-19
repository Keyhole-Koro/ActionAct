"use client";

import { FilteredListPanel } from '@/components/ui/FilteredListPanel';
import { ReviewOpCard } from './ReviewOpCard';
import { useReviewInbox, type ReviewInboxFilter } from '../hooks/useReviewInbox';

const filters: readonly ReviewInboxFilter[] = ['all', 'needs review', 'approved', 'history'];

export function ReviewInboxPanel() {
    const { filter, setFilter, items } = useReviewInbox();

    return (
        <FilteredListPanel
            title="Review Inbox"
            description="Read-only organizeOps feed with state badges and trace visibility."
            filters={filters}
            activeFilter={filter}
            onFilterChange={setFilter}
            emptyMessage="No review operations match the current filter."
            isEmpty={items.length === 0}
        >
            {items.map((item) => (
                <ReviewOpCard key={item.opId} item={item} />
            ))}
        </FilteredListPanel>
    );
}