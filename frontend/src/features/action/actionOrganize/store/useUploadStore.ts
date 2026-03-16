import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { organizeService } from '@/services/organize';
import type { InputProgress, InputProgressStatus } from '@/services/organize/port';

const PENDING_KEY = 'action.uploads.pending';

interface PendingEntry {
    workspaceId: string;
    topicId: string;
    inputId: string;
    filename: string;
    addedAt: number;
}

function loadPending(): PendingEntry[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(PENDING_KEY);
        return raw ? (JSON.parse(raw) as PendingEntry[]) : [];
    } catch {
        return [];
    }
}

function savePending(entries: PendingEntry[]): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(entries));
}

// Keep Firestore unsubscribers outside of state to avoid triggering re-renders.
const unsubscribers = new Map<string, () => void>();

// Guard so bootstrapFromFirestore only runs once per page load.
let bootstrapped = false;

export interface UploadTask {
    id: string; // inputId
    filename: string;
    workspaceId: string;
    topicId: string;
    status: InputProgressStatus;
    progressPercentage: number;
    resolvedTopicId?: string;
}

const statusPercentages: Record<InputProgressStatus, number> = {
    uploaded: 10,
    extracting: 30,
    atomizing: 50,
    resolving_topic: 70,
    updating_draft: 90,
    completed: 100,
    failed: 100,
};

interface UploadStoreState {
    uploads: Record<string, UploadTask>;
    addUpload: (workspaceId: string, topicId: string, inputId: string, filename: string) => void;
    removeUpload: (inputId: string) => void;
    updateProgress: (inputId: string, progress: InputProgress | null) => void;
    bootstrapFromFirestore: () => void;
}

export const useUploadStore = create<UploadStoreState>()(
    subscribeWithSelector((set, get) => ({
        uploads: {},

        addUpload: (workspaceId, topicId, inputId, filename) => {
            // Persist to localStorage so reload can recover in-progress uploads.
            const existing = loadPending().filter(e => e.inputId !== inputId);
            savePending([...existing, { workspaceId, topicId, inputId, filename, addedAt: Date.now() }]);

            set((state) => ({
                uploads: {
                    ...state.uploads,
                    [inputId]: {
                        id: inputId,
                        workspaceId,
                        topicId,
                        filename,
                        status: 'uploaded',
                        progressPercentage: statusPercentages['uploaded'],
                    },
                },
            }));

            const unsubscribe = organizeService.subscribeInputProgress(workspaceId, topicId, inputId, (progress) => {
                get().updateProgress(inputId, progress);
            });
            unsubscribers.set(inputId, unsubscribe);
        },

        removeUpload: (inputId) => {
            const unsub = unsubscribers.get(inputId);
            if (unsub) {
                unsub();
                unsubscribers.delete(inputId);
            }
            savePending(loadPending().filter(e => e.inputId !== inputId));
            set((state) => {
                const next = { ...state.uploads };
                delete next[inputId];
                return { uploads: next };
            });
        },

        updateProgress: (inputId, progress) => {
            if (!progress) return;
            set((state) => {
                const existing = state.uploads[inputId];
                if (!existing) return state;
                return {
                    uploads: {
                        ...state.uploads,
                        [inputId]: {
                            ...existing,
                            status: progress.status,
                            progressPercentage: statusPercentages[progress.status] ?? existing.progressPercentage,
                            resolvedTopicId: progress.resolvedTopicId ?? existing.resolvedTopicId,
                        },
                    },
                };
            });
        },

        bootstrapFromFirestore: () => {
            if (bootstrapped) return;
            bootstrapped = true;

            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const all = loadPending();
            const valid = all.filter(e => e.addedAt > sevenDaysAgo);
            if (valid.length < all.length) savePending(valid);

            const current = get().uploads;
            for (const { workspaceId, topicId, inputId, filename } of valid) {
                if (current[inputId]) continue;
                set((state) => ({
                    uploads: {
                        ...state.uploads,
                        [inputId]: {
                            id: inputId,
                            workspaceId,
                            topicId,
                            filename,
                            status: 'uploaded',
                            progressPercentage: statusPercentages['uploaded'],
                        },
                    },
                }));
                const unsubscribe = organizeService.subscribeInputProgress(workspaceId, topicId, inputId, (progress) => {
                    get().updateProgress(inputId, progress);
                });
                unsubscribers.set(inputId, unsubscribe);
            }
        },
    }))
);
