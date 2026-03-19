"use client";

import { type ReactNode, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { AuthGate } from '@/features/auth/components/AuthGate';
import { FloatingHeader } from './FloatingHeader';
import { AskForm } from '@/components/ui/AskForm';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { FrontendToolBridge } from '@/features/agentTools/components/FrontendToolBridge';
import { UploadStatusDock } from '@/features/action/actionOrganize/components/UploadProgressCard';
import { useUploadStore } from '@/features/action/actionOrganize/store/useUploadStore';

interface AppShellProps {
    children?: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
    const params = useParams<{ id: string }>();
    const { setContext } = useRunContextStore();

    const workspaceId = params?.id ?? '';

    useEffect(() => {
        if (!workspaceId) return;
        setContext(workspaceId);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('run_context.workspaceId', workspaceId);
        }
    }, [workspaceId, setContext]);

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
                            <UploadStatusDock />
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
