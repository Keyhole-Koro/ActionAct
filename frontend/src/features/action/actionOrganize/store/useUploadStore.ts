import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { readLocalStorage, writeLocalStorage } from '@/lib/storage';
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
    return readLocalStorage<PendingEntry[]>(PENDING_KEY, []);
}

function savePending(entries: PendingEntry[]): void {
    writeLocalStorage(PENDING_KEY, entries);
}

// Keep Firestore unsubscribers outside of state to avoid triggering re-renders.
const unsubscribers = new Map<string, () => void>();

// Tracks which workspaces have already been bootstrapped this session.
const bootstrappedWorkspaces = new Set<string>();

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
    bootstrapForWorkspace: (workspaceId: string) => void;
}

export const useUploadStore = create<UploadStoreState>()(
    subscribeWithSelector((set, get) => ({
        uploads: {},

        addUpload: (workspaceId, topicId, inputId, filename) => {
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

            const unsubscribe = organizeService.subscribeInputProgress(workspaceId, inputId, (progress) => {
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

        bootstrapForWorkspace: (workspaceId: string) => {
            if (bootstrappedWorkspaces.has(workspaceId)) return;
            bootstrappedWorkspaces.add(workspaceId);

            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const all = loadPending();
            const valid = all.filter(e => e.addedAt > sevenDaysAgo);
            if (valid.length < all.length) savePending(valid);

            const forThisWorkspace = valid.filter(e => e.workspaceId === workspaceId);
            const current = get().uploads;
            for (const { topicId, inputId, filename } of forThisWorkspace) {
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
                const unsubscribe = organizeService.subscribeInputProgress(workspaceId, inputId, (progress) => {
                    get().updateProgress(inputId, progress);
                });
                unsubscribers.set(inputId, unsubscribe);
            }
        },
    }))
);
