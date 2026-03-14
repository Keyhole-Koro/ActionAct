"use client";

import React, { ReactNode, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AuthGate } from '@/features/auth/components/AuthGate';
import { AppHeader } from './AppHeader';
import { LeftRail } from './LeftRail';
import { RightPanelRouter } from './RightPanelRouter';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { usePanelStore } from '../store/panel-store';
import { Menu, PanelRightClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AskForm } from '@/components/ui/AskForm';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { emitAuthContext } from '@/features/auth/session';

interface AppShellProps {
    children?: ReactNode; // Typically the GraphCanvas
}

export function AppShell({ children }: AppShellProps) {
    const { isOpen, openPanel } = usePanelStore();
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
            window.localStorage.setItem('run_context.workspaceId', nextWorkspaceId);
            window.localStorage.setItem('run_context.topicId', nextTopicId);
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

    return (
        <div className="flex flex-col h-screen w-full bg-background overflow-hidden text-foreground">
            <AppHeader />
            <AuthGate>
            <div className="flex-1 flex overflow-hidden relative">
                {/* Left Rail (Desktop: full width 280px, Tablet: narrow ~64px/icon only. Here we conditionally style. )
            For simplicity, in >=768px we show a fixed width sidebar that might collapse.
            Below 768px we hide it completely and rely on a drawer.
        */}
                <aside className="hidden md:flex flex-col shrink-0 transition-all duration-300 xl:w-72 md:w-64 border-r">
                    <LeftRail />
                </aside>

                {/* Main Canvas Area */}
                <main className="flex-1 relative flex flex-col min-w-0 bg-muted/20">
                    {/* Mobile top overlay for toggling sidebars */}
                    <div className="absolute top-4 left-4 z-10 md:hidden">
                        <Sheet>
                            <SheetTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 w-9">
                                <Menu className="h-4 w-4" />
                            </SheetTrigger>
                            <SheetContent side="left" className="p-0 w-80">
                                <LeftRail />
                            </SheetContent>
                        </Sheet>
                    </div>

                    <div className="absolute top-4 right-4 z-10 flex gap-2">
                        {!isOpen && (
                            <Button
                                variant="outline"
                                size="icon"
                                className="shadow-sm"
                                onClick={() => openPanel('node-detail')}
                            >
                                <PanelRightClose className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    <div className="flex-1 h-full w-full relative">
                        {children}
                        <AskForm />
                    </div>
                </main>

                {/* Right Panel (Desktop: Fixed 320/380px, Mobile: absolute/drawer behavior) 
            Using a simple CSS flex basis. 
            When isOpen is true, it displays.
        */}
                <aside
                    className={`
            hidden md:flex shrink-0 transition-all duration-300 border-l bg-background z-20
            ${isOpen ? 'w-80 xl:w-96' : 'w-0 border-l-0'}
          `}
                >
                    <div className="w-80 xl:w-96 flex-shrink-0 h-full">
                        <RightPanelRouter />
                    </div>
                </aside>

                {/* Mobile Right Panel Drawer */}
                <div className="md:hidden">
                    <Sheet open={isOpen} onOpenChange={(open) => !open && usePanelStore.getState().closePanel()}>
                        <SheetContent side="right" className="p-0 sm:max-w-md w-[85vw]">
                            <RightPanelRouter />
                        </SheetContent>
                    </Sheet>
                </div>

            </div>
            </AuthGate>
        </div>
    );
}
