import React from 'react';
import { Badge } from '@/components/ui/badge';
import { LogoutButton } from '@/features/auth/components/LogoutButton';
import { useAuthState } from '@/features/auth/hooks/useAuthState';
import { config } from '@/lib/config';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { Sparkles, FolderKanban, Network } from 'lucide-react';

export function AppHeader() {
    const isMock = config.useMocks;
    const { workspaceId, topicId } = useRunContextStore();
    const { user } = useAuthState();
    const userInitial = user?.displayName?.trim().charAt(0) || user?.email?.trim().charAt(0) || 'U';

    return (
        <header className="flex flex-col justify-center h-16 px-6 border-b bg-background/80 backdrop-blur-md shrink-0 w-full z-10 sticky top-0 shadow-sm">
            <div className="flex items-center justify-between w-full">

                {/* Brand & Context */}
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 group cursor-default">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
                            <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <h1 className="text-base font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                            Action
                        </h1>
                    </div>

                    <div className="h-6 w-px bg-border/60" />

                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground group">
                            <FolderKanban className="w-4 h-4 group-hover:text-primary transition-colors" />
                            <span className="font-medium truncate max-w-[150px]" title={workspaceId}>
                                {workspaceId}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground group">
                            <Network className="w-4 h-4 group-hover:text-amber-500 transition-colors" />
                            <span className="font-medium truncate max-w-[150px]" title={topicId}>
                                {topicId}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Status & User */}
                <div className="flex items-center gap-4">
                    {isMock && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-100 border-0 font-semibold tracking-wide">
                            Mock Mode
                        </Badge>
                    )}

                    <div className="flex items-center gap-3">
                        {!isMock && user?.email ? (
                            <span className="text-sm font-medium text-muted-foreground truncate max-w-[200px]" title={user.email}>
                                {user.email}
                            </span>
                        ) : null}

                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-muted to-muted/50 border border-border/50 flex items-center justify-center text-sm font-bold text-foreground shadow-sm">
                            {userInitial.toUpperCase()}
                        </div>

                        {!isMock ? <LogoutButton /> : null}
                    </div>
                </div>

            </div>
        </header>
    );
}
