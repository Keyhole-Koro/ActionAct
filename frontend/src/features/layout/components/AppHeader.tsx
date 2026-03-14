import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LogoutButton } from '@/features/auth/components/LogoutButton';
import { useAuthState } from '@/features/auth/hooks/useAuthState';
import { config } from '@/lib/config';
import { useRunContextStore } from '@/features/context/store/run-context-store';

export function AppHeader() {
    const isMock = config.useMocks;
    const { workspaceId, topicId } = useRunContextStore();
    const { user } = useAuthState();
    const userInitial = user?.displayName?.trim().charAt(0) || user?.email?.trim().charAt(0) || 'U';

    return (
        <header className="flex items-center h-14 px-4 border-b bg-background shrink-0 w-full z-10">
            <div className="flex items-center space-x-4 flex-1">
                <h1 className="text-sm font-semibold tracking-tight">Act & Organize</h1>
                <Separator orientation="vertical" className="h-6" />
                <div className="text-sm text-muted-foreground flex items-center space-x-2 min-w-0">
                    <span className="shrink-0">Workspace</span>
                    <Badge variant="outline" className="max-w-44 truncate" title={workspaceId}>
                        {workspaceId}
                    </Badge>
                    <span className="shrink-0 text-xs">Topic</span>
                    <Badge variant="outline" className="max-w-44 truncate" title={topicId}>
                        {topicId}
                    </Badge>
                </div>
            </div>

            <div className="flex items-center space-x-4">
                {isMock && (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80">
                        Mock Mode
                    </Badge>
                )}
                {!isMock && user?.email ? (
                    <Badge variant="outline" title={user.email}>
                        {user.email}
                    </Badge>
                ) : null}
                {!isMock ? <LogoutButton /> : null}
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs">
                    {userInitial.toUpperCase()}
                </div>
            </div>
        </header>
    );
}
