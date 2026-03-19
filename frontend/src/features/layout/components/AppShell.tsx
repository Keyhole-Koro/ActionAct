"use client";

import React, { ReactNode, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AuthGate } from '@/features/auth/components/AuthGate';
import { FloatingHeader } from './FloatingHeader';
import { AskForm } from '@/components/ui/AskForm';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { FrontendToolBridge } from '@/features/agentTools/components/FrontendToolBridge';
import { UploadProgressList } from '@/features/action/actionOrganize/components/UploadProgressCard';
import { useUploadStore } from '@/features/action/actionOrganize/store/useUploadStore';

interface AppShellProps {
    children?: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const { setContext } = useRunContextStore();

    const workspaceId = params?.id ?? '';

    // Sync workspaceId into the store; topicId comes from localStorage.
    useEffect(() => {
        if (!workspaceId) return;

        const persistedTopicId = typeof window !== 'undefined'
            ? window.localStorage.getItem('run_context.topicId')
            : null;

        setContext(workspaceId, persistedTopicId ?? undefined);

        if (typeof window !== 'undefined') {
            window.localStorage.setItem('run_context.workspaceId', workspaceId);
        }
    }, [workspaceId, setContext]);

    // Handle auth-context events (e.g., clicking a completed upload to jump to a topic).
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const onAuthContext = (event: Event) => {
            const e = event as CustomEvent<{ workspaceId?: string; topicId?: string }>;
            const nextWsId = e.detail?.workspaceId?.trim();
            const nextTopicId = e.detail?.topicId?.trim();
            if (!nextWsId || !nextTopicId) return;
            if (typeof window !== 'undefined') window.localStorage.setItem('run_context.topicId', nextTopicId);
            router.push(`/workspace/${nextWsId}`);
        };

        window.addEventListener('action:auth-context', onAuthContext);
        return () => window.removeEventListener('action:auth-context', onAuthContext);
    }, [router]);

    // Restore in-progress uploads for the current workspace after reload or workspace switch.
    useEffect(() => {
        if (!workspaceId) return;
        useUploadStore.getState().bootstrapForWorkspace(workspaceId);
    }, [workspaceId]);

    return (
        <div className="flex flex-col h-screen w-full bg-background overflow-hidden text-foreground">
            <FrontendToolBridge />
            <AuthGate>
                <div className="flex-1 flex overflow-hidden relative">
                    <main className="flex-1 relative flex flex-col min-w-0 bg-muted/20">
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
