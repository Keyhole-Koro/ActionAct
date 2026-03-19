"use client";

import { FilteredListPanel } from '@/components/ui/FilteredListPanel';
import { TopicTimelineItem } from './TopicTimelineItem';
import { useTopicActivity, type TopicActivityFilter } from '../hooks/useTopicActivity';

const filters: readonly TopicActivityFilter[] = ['all', 'processing', 'completed', 'failed'];

export function TopicActivityPanel() {
    const { filter, setFilter, items } = useTopicActivity();

    return (
        <FilteredListPanel
            title="Topic Activity"
            description="Input progress, routing, draft, bundle, and outline updates grouped by input."
            filters={filters}
            activeFilter={filter}
            onFilterChange={setFilter}
            emptyMessage="No activity items match the current filter."
            isEmpty={items.length === 0}
        >
            {items.map((item) => (
                <TopicTimelineItem key={item.inputId} item={item} />
            ))}
        </FilteredListPanel>
    );
}