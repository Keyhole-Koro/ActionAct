import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { organizeService } from '@/services/organize';
import { InputProgress, InputProgressStatus } from '@/services/organize/port';

export interface UploadTask {
    id: string; // usually inputId
    filename: string;
    workspaceId: string;
    topicId: string;
    status: InputProgressStatus;
    progressPercentage: number;
    _unsubscribe?: () => void;
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
}

export const useUploadStore = create<UploadStoreState>()(
    subscribeWithSelector((set, get) => ({
        uploads: {},

        addUpload: (workspaceId, topicId, inputId, filename) => {
            set((state) => ({
                uploads: {
                    ...state.uploads,
                    [inputId]: {
                        id: inputId,
                        workspaceId,
                        topicId,
                        filename,
                        status: 'uploaded',
                        progressPercentage: statusPercentages['uploaded']
                    }
                }
            }));

            // Start listening
            const unsubscribe = organizeService.subscribeInputProgress(workspaceId, topicId, inputId, (progress) => {
                get().updateProgress(inputId, progress);
            });

            // Store unsubscriber somewhere? Or we can let UI tear it down, but keeping it in store is fine for global uploads.
            // For now, simple implementation: we just keep listening until it finishes.
            // When taking `removeUpload`, we don't have unsubscribe easily here, so we could track it.
            // Let's attach unsubscribe to a ref later if we need strict cleanup.
            const currentTask = get().uploads[inputId];
            if (currentTask) {
                currentTask._unsubscribe = unsubscribe;
            }
        },

        removeUpload: (inputId) => {
            set((state) => {
                const next = { ...state.uploads };
                const task = next[inputId];
                if (task?._unsubscribe) {
                    task._unsubscribe();
                }
                delete next[inputId];
                return { uploads: next };
            });
        },

        updateProgress: (inputId, progress) => {
            if (!progress) return;

            set((state) => {
                const existing = state.uploads[inputId];
                if (!existing) return state;

                const isDone = progress.status === 'completed' || progress.status === 'failed';

                // If it finished, schedule removal after 3s
                if (isDone && existing.status !== progress.status) {
                    setTimeout(() => {
                        get().removeUpload(inputId);
                    }, 3000);
                }

                return {
                    uploads: {
                        ...state.uploads,
                        [inputId]: {
                            ...existing,
                            status: progress.status,
                            progressPercentage: statusPercentages[progress.status] ?? existing.progressPercentage
                        }
                    }
                };
            });
        }
    }))
);
