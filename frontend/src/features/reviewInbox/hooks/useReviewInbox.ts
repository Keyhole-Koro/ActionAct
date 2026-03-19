"use client";

import { useEffect, useMemo, useState } from 'react';

import { useRunContextStore } from '@/features/context/store/run-context-store';
import { organizeService } from '@/services/organize';
import type { ReviewOpItem } from '@/services/organize/port';

export type ReviewInboxFilter = 'all' | 'needs review' | 'approved' | 'history';

const stateOrder: Record<ReviewOpItem['state'], number> = {
    planned: 0,
    approved: 1,
    applied: 2,
    dismissed: 3,
};

export function useReviewInbox() {
    const { workspaceId } = useRunContextStore();
    const [items, setItems] = useState<ReviewOpItem[]>([]);
    const [filter, setFilter] = useState<ReviewInboxFilter>('all');

    useEffect(() => {
        if (!workspaceId) {
            return;
        }

        return organizeService.subscribeOrganizeOps(workspaceId, setItems);
    }, [workspaceId]);

    const filteredItems = useMemo(() => {
        if (!workspaceId) {
            return [];
        }

        const next = items.filter((item) => {
            switch (filter) {
                case 'needs review':
                    return item.state === 'planned' || item.requiresHumanReview === true;
                case 'approved':
                    return item.state === 'approved';
                case 'history':
                    return item.state === 'applied' || item.state === 'dismissed';
                case 'all':
                default:
                    return true;
            }
        });

        return next.sort((left, right) => {
            const stateDiff = stateOrder[left.state] - stateOrder[right.state];
            if (stateDiff !== 0) {
                return stateDiff;
            }
            return (right.createdAt ?? 0) - (left.createdAt ?? 0);
        });
    }, [filter, items, workspaceId]);

    return {
        filter,
        setFilter,
        items: filteredItems,
    };
}
