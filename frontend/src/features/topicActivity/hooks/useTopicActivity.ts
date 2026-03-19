"use client";

import { useEffect, useMemo, useState } from 'react';

import { useUploadStore } from '@/features/action/actionOrganize/store/useUploadStore';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { organizeService } from '@/services/organize';
import type { TopicActivityItem } from '@/services/organize/port';

export type TopicActivityFilter = 'all' | 'processing' | 'completed' | 'failed';

function priority(item: TopicActivityItem) {
    if (item.status === 'failed') return 1;
    if (item.status !== 'completed') return 0;
    return 2;
}

export function useTopicActivity() {
    const { workspaceId } = useRunContextStore();
    const uploads = useUploadStore((state) => state.uploads);
    const [items, setItems] = useState<TopicActivityItem[]>([]);
    const [filter, setFilter] = useState<TopicActivityFilter>('all');

    useEffect(() => {
        if (!workspaceId) {
            return;
        }

        return organizeService.subscribeTopicActivity(workspaceId, setItems);
    }, [workspaceId]);

    const filteredItems = useMemo(() => {
        if (!workspaceId) {
            return [];
        }

        const uploadById = new Map(Object.values(uploads).map((upload) => [upload.id, upload]));
        const merged = items.map((item) => {
            const upload = uploadById.get(item.inputId);
            return {
                ...item,
                title: upload?.filename ?? item.inputId,
            };
        });

        const filtered = merged.filter((item) => {
            switch (filter) {
                case 'processing':
                    return item.status !== 'completed' && item.status !== 'failed';
                case 'completed':
                    return item.status === 'completed';
                case 'failed':
                    return item.status === 'failed';
                case 'all':
                default:
                    return true;
            }
        });

        return filtered.sort((left, right) => {
            const priorityDiff = priority(left) - priority(right);
            if (priorityDiff !== 0) {
                return priorityDiff;
            }
            return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
        });
    }, [filter, items, uploads, workspaceId]);

    return {
        filter,
        setFilter,
        items: filteredItems,
    };
}
