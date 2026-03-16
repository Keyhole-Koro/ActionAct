"use client";

import React, { ReactNode, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AuthGate } from '@/features/auth/components/AuthGate';
import { FloatingHeader } from './FloatingHeader';
import { AskForm } from '@/components/ui/AskForm';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { emitAuthContext } from '@/features/auth/session';
import { FrontendToolBridge } from '@/features/agentTools/components/FrontendToolBridge';
import { UploadProgressList } from '@/features/action/actionOrganize/components/UploadProgressCard';
import { useUploadStore } from '@/features/action/actionOrganize/store/useUploadStore';

interface AppShellProps {
    children?: ReactNode; // Typically the GraphCanvas
}

export function AppShell({ children }: AppShellProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { workspaceId, topicId, setContext } = useRunContextStore();

    useEffect(() => {
        const authWorkspaceId = searchParams.get('authWorkspaceId')?.trim();
        const authTopicId = searchParams.get('authTopicId')?.trim();

        const params = new URLSearchParams(searchParams.toString());
        let needsCleanup = false;

        if (authWorkspaceId && authTopicId) {
            emitAuthContext({ workspaceId: authWorkspaceId, topicId: authTopicId });
            params.delete('authWorkspaceId');
            params.delete('authTopicId');
            needsCleanup = true;
        }

        if (needsCleanup) {
            const next = params.toString();
            router.replace(next ? `${pathname}?${next}` : pathname);
        }
    }, [pathname, router, searchParams]);

    useEffect(() => {
        const urlWorkspaceId = searchParams.get('workspaceId')?.trim();
        const urlTopicId = searchParams.get('topicId')?.trim();
        const persistedWorkspaceId = typeof window !== 'undefined' ? window.localStorage.getItem('run_context.workspaceId') : null;
        const persistedTopicId = typeof window !== 'undefined' ? window.localStorage.getItem('run_context.topicId') : null;

        const nextWorkspaceId = urlWorkspaceId || persistedWorkspaceId || workspaceId;
        const nextTopicId = urlTopicId || persistedTopicId || topicId;

        if (nextWorkspaceId !== workspaceId || nextTopicId !== topicId) {
            setContext(nextWorkspaceId, nextTopicId);
        }

        if (typeof window !== 'undefined') {
            if (nextWorkspaceId) window.localStorage.setItem('run_context.workspaceId', nextWorkspaceId);
            if (nextTopicId) window.localStorage.setItem('run_context.topicId', nextTopicId);
        }
    }, [searchParams, setContext, topicId, workspaceId]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const onAuthContext = (event: Event) => {
            const customEvent = event as CustomEvent<{ workspaceId?: string; topicId?: string }>;
            const nextWorkspaceId = customEvent.detail?.workspaceId?.trim();
            const nextTopicId = customEvent.detail?.topicId?.trim();

            if (!nextWorkspaceId || !nextTopicId) {
                return;
            }

            setContext(nextWorkspaceId, nextTopicId);
            window.localStorage.setItem('run_context.workspaceId', nextWorkspaceId);
            window.localStorage.setItem('run_context.topicId', nextTopicId);
        };

        window.addEventListener('action:auth-context', onAuthContext);
        return () => window.removeEventListener('action:auth-context', onAuthContext);
    }, [setContext]);

    // Restore any in-progress uploads that were running before the last page reload.
    useEffect(() => {
        if (!workspaceId) return;
        useUploadStore.getState().bootstrapFromFirestore();
    }, [workspaceId]);

    return (
        <div className="flex flex-col h-screen w-full bg-background overflow-hidden text-foreground">
            <FrontendToolBridge />
            <AuthGate>
                <div className="flex-1 flex overflow-hidden relative">
                    {/* Main Canvas Area */}
                    <main className="flex-1 relative flex flex-col min-w-0 bg-muted/20">
                        {/* Top-Left Floating Controls */}
                        <FloatingHeader />
                        <div className="absolute top-20 left-4 z-20 pointer-events-none flex flex-col gap-2">
                            <UploadProgressList />
                        </div>

                        <div className="flex-1 h-full w-full relative">
                            {children}
                            <AskForm />
                        </div>
                    </main>
                </div>
            </AuthGate>
        </div>
    );
}
